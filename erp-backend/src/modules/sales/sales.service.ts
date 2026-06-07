import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Sale, SalePaymentCommitment } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleVoucherDto } from './dto/create-sale-voucher.dto';
import { ItemSerial } from '../item-serials/entities/item-serial.entity';
import { StockService } from '../stock/stock.service';
import { Item } from '../items/entities/item.entity';
import { OutboxService } from '../outbox/outbox.service';
import { SequenceService } from '../sequences/sequence.service';
import { Customer } from '../customers/entities/customer.entity';
import { Payment } from '../payments/entities/payment.entity';
import { JournalService } from '../journals/journal.service';
import { AccountsService } from '../accounts/accounts.service';
import { ItemSerialsService } from '../item-serials/item-serials.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
    private readonly sequences: SequenceService,
    private readonly journals: JournalService,
    private readonly accounts: AccountsService,
    private readonly itemSerials: ItemSerialsService,
  ) {}

  /**
   * Computes a customer's current unpaid balance the same way the customer
   * ledger does: opening balance + sum(sale.dueAmount) - sum(receipts.amount).
   * Sale returns are intentionally NOT subtracted here — they're already
   * applied as separate credits in the ledger; for credit-limit gating we
   * only care about money the customer still owes from un-paid invoices.
   */
  private async customerOutstanding(
    manager: EntityManager,
    customerId: string,
  ): Promise<number> {
    const c = await manager.getRepository(Customer).findOne({ where: { id: customerId } });
    if (!c) return 0;
    const opening = Number(c.openingBalance) || 0;
    const dueRow = await manager
      .getRepository(Sale)
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.due_amount), 0)', 'due')
      .where('s.customer_id = :customerId', { customerId })
      .getRawOne<{ due: string }>();
    const receiptsRow = await manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'paid')
      .where('p.customer_id = :customerId', { customerId })
      .andWhere("p.direction = 'IN'")
      .getRawOne<{ paid: string }>();
    const due = Number(dueRow?.due ?? 0);
    const paid = Number(receiptsRow?.paid ?? 0);
    return opening + due - paid;
  }

  async create(dto: CreateSaleDto, opts?: { skipOutbox?: boolean }): Promise<Sale> {
    const saved = await this.dataSource.transaction(async (manager) =>
      this.createInTransaction(manager, dto),
    );

    // Local-first nodes (those configured with CLOUD_SYNC_URL) enqueue every
    // locally-originated sale for the background worker to push. skipOutbox
    // is true when this create() is called from the cloud receiver or from
    // createFromVoucher() (which emits its own SALE_VOUCHER_CREATED event).
    if (!opts?.skipOutbox && process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('SALE_CREATED', { ...dto, invoiceNo: saved.invoiceNo });
    }

    return saved;
  }

  /**
   * Inner sale-creation flow, scoped to a caller-supplied EntityManager so it
   * can run as part of a larger atomic transaction (e.g. the voucher endpoint
   * wrapping Sale + N Receipts together). Does NOT emit outbox events —
   * the outer wrapper is responsible for that.
   *
   * Identical behaviour to the body that used to live inline in `create()`:
   *   - builds SaleItem rows with COGS snapshots and rolls Item.costedQty
   *   - enforces credit-limit on residual customers
   *   - posts the balanced journal entry (Dr Cash/Bank, Dr A/R or Deferred,
   *     Cr Revenue, Dr COGS, Cr Inventory)
   *   - materialises paymentCommitments when there's a residual
   */
  private async createInTransaction(
    manager: EntityManager,
    dto: CreateSaleDto,
  ): Promise<Sale> {
      const itemRepo = manager.getRepository(Item);
      const saleRepo = manager.getRepository(Sale);

      let totalAmount = 0;
      let totalCogs = 0;
      const lines: SaleItem[] = [];

      for (const line of dto.lines) {
        const item = await itemRepo.findOne({ where: { id: line.itemId } });
        if (!item) {
          throw new NotFoundException(`Item ${line.itemId} not found`);
        }
        const unitPrice =
          line.unitPrice != null ? line.unitPrice : Number(item.salePrice);
        const lineTotal = Number((unitPrice * line.quantity).toFixed(2));
        totalAmount += lineTotal;

        // COGS basis = current weighted-average cost, snapshotted onto the
        // line so historical reports are immutable. Falls back to the legacy
        // purchase-price when avgCost is still 0 (an item that was created
        // before this migration and hasn't seen a purchase yet).
        const unitCost =
          Number(item.avgCost) > 0
            ? Number(item.avgCost)
            : Number(item.purchasePrice);
        totalCogs += unitCost * line.quantity;

        const sl = manager.create(SaleItem, {
          itemId: item.id,
          quantity: line.quantity,
          unitPrice,
          lineTotal,
          costAtSaleTime: unitCost,
        });
        lines.push(sl);

        // Decrement costedQty so the next purchase's weighted-average roll-up
        // uses the right denominator. avgCost stays the same — we're just
        // removing units at the current cost.
        item.costedQty = Math.max(0, Number(item.costedQty) - line.quantity);
        await itemRepo.save(item);
      }

      const discount = dto.discount ?? 0;
      const netAmount = Number((totalAmount - discount).toFixed(2));
      const paidAmount = dto.paidAmount ?? netAmount;
      const dueAmount = Number((netAmount - paidAmount).toFixed(2));

      const invoiceNo = dto.invoiceNo ?? (await this.nextInvoiceNo(saleRepo));

      // Sales paid in cash/card/bank credit a specific account (cash drawer,
      // bank wallet, etc.). CREDIT-method sales must not pin an account —
      // nothing is collected yet, the whole amount sits as A/R.
      const paymentMethod = dto.paymentMethod ?? 'CASH';
      const accountId = paymentMethod === 'CREDIT' ? undefined : dto.accountId;

      // Credit-limit gate: any sale that leaves money owed (CREDIT or
      // partial-pay) must respect the customer's creditEnabled flag and
      // their creditLimit. Blocks the sale before stock is moved.
      if (dueAmount > 0 && dto.customerId) {
        const customer = await manager
          .getRepository(Customer)
          .findOne({ where: { id: dto.customerId } });
        if (customer) {
          if (!customer.creditEnabled) {
            throw new BadRequestException(
              `Credit is not enabled for ${customer.name}. Collect the full amount or enable credit on the customer.`,
            );
          }
          const currentOutstanding = await this.customerOutstanding(
            manager,
            dto.customerId,
          );
          const limit = Number(customer.creditLimit) || 0;
          const projected = currentOutstanding + dueAmount;
          if (projected > limit) {
            throw new BadRequestException(
              `Credit limit exceeded for ${customer.name}: outstanding Rs ${currentOutstanding.toFixed(2)} + this sale Rs ${dueAmount.toFixed(2)} = Rs ${projected.toFixed(2)} > limit Rs ${limit.toFixed(2)}.`,
            );
          }
        }
      }

      // Materialise deferred-cash commitments. The caller can supply either
      // `paymentCommitments` (rich) or the legacy convenience field
      // `expectedPaymentDate` (one promise, residual). Commitments only make
      // sense when there's actually a residual; we silently drop them on a
      // fully-paid sale.
      const paymentCommitments = dueAmount > 0
        ? buildCommitments(dueAmount, dto)
        : undefined;

      const sale = saleRepo.create({
        invoiceNo,
        customerId: dto.customerId,
        storeId: dto.storeId,
        totalAmount,
        discount,
        netAmount,
        paidAmount,
        dueAmount,
        paymentMethod,
        accountId,
        notes: dto.notes,
        paymentCommitments,
        amountPaidSettled: paidAmount,
        lines,
      });
      const persisted = await saleRepo.save(sale);

      for (const ln of persisted.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: dto.storeId,
            type: 'OUT',
            quantity: ln.quantity,
            referenceType: 'SALE',
            referenceId: persisted.id,
          },
          manager,
        );
      }

      // Double-entry journal posting. Recognises both the revenue side and
      // the COGS / inventory side in one balanced entry:
      //   Dr Cash/Bank account  (paidAmount, into the chosen accountId, or
      //                          CASH_ON_HAND fallback when accountId is null)
      //   Dr A/R                (dueAmount — CREDIT or partial-pay residual)
      //   Cr Revenue            (netAmount = paidAmount + dueAmount)
      //   Dr COGS               (qty × item.purchasePrice — current cost basis)
      //   Cr Inventory          (same)
      // Reports continue to read from operational tables for now; the journal
      // is a parallel ledger until the read-side flip ships.
      const sysRevenue = await this.accounts.findSystem('REVENUE');
      const sysCOGS = await this.accounts.findSystem('COGS');
      const sysInventory = await this.accounts.findSystem('INVENTORY');
      const sysAR = await this.accounts.findSystem('A_R');
      const sysDeferred = await this.accounts.findSystem('DEFERRED_RECEIVABLE');
      const sysCashFallback = await this.accounts.findSystem('CASH_ON_HAND');

      const cogs = Number(totalCogs.toFixed(2));
      const journalLines: Array<{
        accountId: string;
        debit?: number;
        credit?: number;
        narration?: string;
      }> = [];
      if (paidAmount > 0) {
        const receivingAccountId = accountId ?? sysCashFallback.id;
        journalLines.push({
          accountId: receivingAccountId,
          debit: paidAmount,
          narration: `Sale ${invoiceNo} receipt`,
        });
      }
      if (dueAmount > 0) {
        // Residual lands on Deferred Cash Receivables when the customer
        // committed to specific dates ("pay half on the 20th"); otherwise
        // it's plain open-ended A/R. The dashboard widget reads commitments
        // and shows what's coming due.
        const residualAccountId =
          paymentCommitments && paymentCommitments.length > 0
            ? sysDeferred.id
            : sysAR.id;
        journalLines.push({
          accountId: residualAccountId,
          debit: dueAmount,
          narration: paymentCommitments
            ? `Sale ${invoiceNo} — deferred cash`
            : `Sale ${invoiceNo} on credit`,
        });
      }
      journalLines.push({
        accountId: sysRevenue.id,
        credit: netAmount,
        narration: `Sale ${invoiceNo} revenue`,
      });
      if (cogs > 0) {
        journalLines.push({
          accountId: sysCOGS.id,
          debit: cogs,
          narration: `Sale ${invoiceNo} COGS`,
        });
        journalLines.push({
          accountId: sysInventory.id,
          credit: cogs,
          narration: `Sale ${invoiceNo} inventory out`,
        });
      }
      await this.journals.post(
        {
          entryDate: persisted.createdAt,
          sourceModule: 'SALE',
          sourceRef: invoiceNo,
          description: `Sale ${invoiceNo}`,
          lines: journalLines,
        },
        manager,
      );

      return persisted;
  }

  /**
   * Sales Voucher creation: a single atomic transaction that creates one Sale
   * plus N Receipt vouchers (one per payment split), so a customer paying
   * `Cash 20k + HBL 100k + on-account 10k` for a Rs 130k invoice lands as
   * one Sale row + two Receipt rows + the corresponding journal lines.
   *
   * Design: the underlying Sale is created with `paidAmount=0` and
   * `paymentMethod='CREDIT'`, so its journal posts the FULL net amount onto
   * A/R (or Deferred Cash Receivables when commitments are supplied). Each
   * split is then a normal Receipt voucher that posts a balancing
   * `Dr <accountId>` / `Cr A/R` (or Deferred) pair, naturally reducing the
   * customer's outstanding balance to `net − sum(splits)`. The customer
   * ledger reads as: Sale +net, then one row per split, residual is the
   * customer's open A/R.
   *
   * Failure modes:
   *   - splits sum > net  → BadRequestException before any DB write
   *   - any split fails (bad account id, etc.) → entire transaction rolls
   *     back; the Sale is NOT committed. All-or-nothing.
   */
  async createFromVoucher(
    dto: CreateSaleVoucherDto,
  ): Promise<{ sale: Sale; receipts: Payment[] }> {
    // Pre-flight: splits must be non-negative and not exceed net.
    const splitTotal = (dto.splits ?? []).reduce(
      (s, x) => s + Number(x.amount || 0),
      0,
    );
    if (splitTotal < 0) {
      throw new BadRequestException('Split amounts must be non-negative.');
    }
    const grossTotal = (dto.lines ?? []).reduce(
      (s, l) => s + Number(l.unitPrice || 0) * Number(l.quantity || 0),
      0,
    );
    const netTotal = Number((grossTotal - (dto.discount ?? 0)).toFixed(2));
    if (splitTotal > netTotal + 0.005) {
      throw new BadRequestException(
        `Splits sum (${splitTotal.toFixed(2)}) exceeds net total (${netTotal.toFixed(2)}). Either drop a split or raise the line totals.`,
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      // 1. Create the Sale itself with the whole net on the receivable side.
      //    Each split below clears its slice via a normal Receipt voucher.
      const baseDto: CreateSaleDto = {
        invoiceNo: dto.invoiceNo,
        customerId: dto.customerId,
        storeId: dto.storeId,
        discount: dto.discount,
        notes: dto.notes,
        expectedPaymentDate: dto.expectedPaymentDate,
        paymentCommitments: dto.paymentCommitments,
        lines: dto.lines,
        paidAmount: 0,
        paymentMethod: 'CREDIT',
        accountId: undefined,
      };
      const sale = await this.createInTransaction(manager, baseDto);

      // 2. Per-split: a normal Receipt voucher row + a balancing journal
      //    Dr <accountId> / Cr A/R (or Deferred). Posting these inside the
      //    same manager keeps the whole flow atomic.
      const sysAR = await this.accounts.findSystem('A_R');
      const sysDeferred = await this.accounts.findSystem('DEFERRED_RECEIVABLE');
      const residualAccountId =
        sale.paymentCommitments && sale.paymentCommitments.length > 0
          ? sysDeferred.id
          : sysAR.id;
      const paymentRepo = manager.getRepository(Payment);

      const receipts: Payment[] = [];
      const splitList = dto.splits ?? [];
      for (let i = 0; i < splitList.length; i += 1) {
        const split = splitList[i];
        const amount = Number(split.amount);
        if (amount <= 0) continue;
        const seq = await this.sequences.next('RCT', () => paymentRepo.count());
        const voucher = paymentRepo.create({
          voucherNo: seq,
          direction: 'IN' as const,
          accountId: split.accountId,
          customerId: dto.customerId,
          amount,
          referenceType: 'SALE_SPLIT',
          referenceId: sale.id,
          notes:
            split.reference ??
            `Split ${i + 1}/${splitList.length} for ${sale.invoiceNo}`,
        });
        const saved = await paymentRepo.save(voucher);
        receipts.push(saved);

        await this.journals.post(
          {
            entryDate: sale.createdAt,
            sourceModule: 'PAYMENT',
            sourceRef: seq,
            description: `${sale.invoiceNo} split #${i + 1}`,
            lines: [
              {
                accountId: split.accountId,
                debit: amount,
                narration: `Voucher ${sale.invoiceNo} payment via account`,
              },
              {
                accountId: residualAccountId,
                credit: amount,
                narration: `Voucher ${sale.invoiceNo} clears receivable`,
              },
            ],
          },
          manager,
        );
      }

      // 3. Reflect the at-sale-time payments on the Sale header so the
      //    customer-balances roll-up and the booking-hold gate see consistent
      //    numbers. Sale.dueAmount drops by the total splits collected; the
      //    booking state machine (BOOKED serials) was already set inside
      //    createInTransaction based on the initial dueAmount = netTotal, so
      //    if sum(splits) clears the residual to zero we also flip any
      //    booked serials to DELIVERED — same hook settleCommitment uses.
      if (splitTotal > 0) {
        const saleRepo = manager.getRepository(Sale);
        sale.paidAmount = Number(
          (Number(sale.paidAmount ?? 0) + splitTotal).toFixed(2),
        );
        sale.amountPaidSettled = Number(
          (Number(sale.amountPaidSettled ?? 0) + splitTotal).toFixed(2),
        );
        sale.dueAmount = Math.max(
          0,
          Number((Number(sale.dueAmount ?? 0) - splitTotal).toFixed(2)),
        );
        await saleRepo.save(sale);

        if (sale.dueAmount <= 0.005) {
          await this.itemSerials.markDelivered(sale.invoiceNo, manager);
        }
      }

      return { sale, receipts };
    });

    if (process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('SALE_VOUCHER_CREATED', {
        ...dto,
        invoiceNo: result.sale.invoiceNo,
      });
    }

    return result;
  }

  private async nextInvoiceNo(repo: Repository<Sale>): Promise<string> {
    return this.sequences.next('INV', () => repo.count());
  }

  findAll() {
    return this.sales.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const sale = await this.sales.findOne({ where: { id } });
    if (!sale) throw new NotFoundException(`Sale ${id} not found`);
    return sale;
  }

  /**
   * Voids a sale by:
   *   1. Looking up the original sale and its journal entry.
   *   2. Posting a balancing reversal journal entry (handled by JournalService).
   *   3. Recording inverse stock movements (IN for every original OUT line).
   *   4. Marking the original `reversedAt` / `reversedBy` / `reversalReason`.
   * The original row is NOT deleted — it stays visible with the REVERSED chip.
   * Idempotent: re-calling on the same sale just returns the existing reversal.
   */
  async reverse(
    id: string,
    opts: { userId?: string; reason: string },
  ): Promise<Sale> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('Reversal requires a reason.');
    }
    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const sale = await saleRepo.findOne({
        where: { id },
        relations: ['lines'],
      });
      if (!sale) throw new NotFoundException(`Sale ${id} not found`);

      if (sale.reversedAt) {
        // Idempotent — already reversed.
        return sale;
      }

      // Find the original journal entry and post a balancing reversal.
      const originalEntry = await this.journals.findBySource('SALE', sale.invoiceNo);
      if (originalEntry) {
        await this.journals.reverse(
          originalEntry.id,
          {
            entryDate: new Date(),
            description: `Reversal of sale ${sale.invoiceNo}`,
            reason: opts.reason,
          },
          manager,
        );
      }

      // Reverse the stock OUTs with corresponding INs and restore the costed
      // quantity so the next weighted-average roll-up has the right
      // denominator. avgCost is intentionally NOT shifted — the returned
      // units are assumed to come back at the same cost they left at.
      const itemRepo = manager.getRepository(Item);
      for (const ln of sale.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: sale.storeId,
            type: 'IN',
            quantity: ln.quantity,
            referenceType: 'SALE_REVERSAL',
            referenceId: sale.id,
            note: `Reversal of ${sale.invoiceNo}: ${opts.reason}`,
          },
          manager,
        );
        const it = await itemRepo.findOne({ where: { id: ln.itemId } });
        if (it) {
          it.costedQty = Number(it.costedQty) + Number(ln.quantity);
          await itemRepo.save(it);
        }
      }

      // Flip every serial bound to this invoice back to RETURNED so the
      // warranty lookup ("is this unit still under cover from us?") returns
      // the right answer post-reversal. No-op if no serials were captured.
      await this.itemSerials.unbindFromInvoice(sale.invoiceNo, manager);

      sale.reversedAt = new Date();
      sale.reversedBy = opts.userId;
      sale.reversalReason = opts.reason;
      return saleRepo.save(sale);
    });
  }

  /**
   * Dashboard / collections feed: every PENDING commitment whose dueDate
   * falls within the next 7 days (or is already past). Joined with the
   * customer name + phone so the widget doesn't need a second roundtrip.
   */
  async upcomingDeferred(): Promise<
    Array<{
      saleId: string;
      invoiceNo: string;
      customerId?: string;
      customerName: string;
      customerPhone?: string;
      commitmentIndex: number;
      dueDate: string;
      expectedAmount: number;
      remainingAmount: number;
      overdue: boolean;
      daysUntilDue: number;
    }>
  > {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Pull every sale with a non-empty commitments column. The total row
    // count for a single-shop ERP is small enough that a Node-side filter is
    // fine and avoids reaching for dialect-specific JSON operators (SQLite +
    // Postgres can't share the same `paymentCommitments @> [...]` syntax).
    const sales = await this.sales
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .where('s.paymentCommitments IS NOT NULL')
      .andWhere('s.reversedAt IS NULL')
      .getMany();
    const out: Array<{
      saleId: string;
      invoiceNo: string;
      customerId?: string;
      customerName: string;
      customerPhone?: string;
      commitmentIndex: number;
      dueDate: string;
      expectedAmount: number;
      remainingAmount: number;
      overdue: boolean;
      daysUntilDue: number;
    }> = [];
    for (const s of sales) {
      const cs = s.paymentCommitments ?? [];
      for (let i = 0; i < cs.length; i += 1) {
        const c = cs[i];
        if (c.status !== 'PENDING') continue;
        const due = new Date(c.dueDate);
        if (due > horizon) continue;
        const remaining = Number(
          (c.expectedAmount - Number(c.actualAmount ?? 0)).toFixed(2),
        );
        if (remaining <= 0) continue;
        // Signed delta in whole days. Negative = overdue, 0 = due today,
        // positive = N days remaining. The UI uses this to render
        // "Overdue 4d" / "Due today" / "Due in 2d" chips instead of dates.
        const daysUntilDue = Math.floor(
          (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        out.push({
          saleId: s.id,
          invoiceNo: s.invoiceNo,
          customerId: s.customerId,
          customerName: s.customer?.name ?? 'Walk-in',
          customerPhone: s.customer?.phone,
          commitmentIndex: i,
          dueDate: c.dueDate,
          expectedAmount: c.expectedAmount,
          remainingAmount: remaining,
          overdue: due < today,
          daysUntilDue,
        });
      }
    }
    out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return out;
  }

  /**
   * Settle one of a sale's deferred-cash commitments. Creates the matching
   * Receipt voucher (so the customer ledger sees a normal payment row),
   * bumps `amountPaidSettled`, and flips the commitment entry to PAID once
   * the cumulative settled amount on that entry reaches `expectedAmount`.
   * Partial settlements are supported — they update `actualAmount` but
   * Lists every sale that's holding a BOOKED unit (partial-payment, not
   * yet delivered) where the booking is at least `minDays` old. The owner's
   * dashboard for recovering capital tied up in dead reservations — the
   * customer paid an advance, took the receipt, never came back. Each row
   * carries the linked serials so the Release-to-Floor confirmation can
   * surface exactly which units are about to revert to AVAILABLE.
   */
  async overdueBookings(
    minDays = 7,
  ): Promise<
    Array<{
      saleId: string;
      invoiceNo: string;
      customerId?: string;
      customerName: string;
      customerPhone?: string;
      bookedOn: string;
      daysElapsed: number;
      remainingDue: number;
      paidSoFar: number;
      serials: Array<{ serial: string; itemName: string }>;
    }>
  > {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Pull every BOOKED serial row in one query, then group by invoice.
    // BOOKED implies allocationStatus, which is also keyed for fast scan.
    const bookedRows = await this.dataSource
      .getRepository(ItemSerial)
      .find({ where: { allocationStatus: 'BOOKED' as any } });
    if (bookedRows.length === 0) return [];

    const byInvoice = new Map<
      string,
      Array<{ serial: string; itemName: string }>
    >();
    for (const r of bookedRows as any[]) {
      const list = byInvoice.get(r.saleInvoiceNo) ?? [];
      list.push({
        serial: r.serial,
        itemName: r.item?.modelNo ?? r.item?.name ?? r.serial,
      });
      byInvoice.set(r.saleInvoiceNo, list);
    }

    const sales = await this.sales.find({
      where: { invoiceNo: In(Array.from(byInvoice.keys())) },
      relations: ['customer'],
    });

    const out: Array<{
      saleId: string;
      invoiceNo: string;
      customerId?: string;
      customerName: string;
      customerPhone?: string;
      bookedOn: string;
      daysElapsed: number;
      remainingDue: number;
      paidSoFar: number;
      serials: Array<{ serial: string; itemName: string }>;
    }> = [];

    for (const s of sales) {
      if (s.reversedAt) continue;
      const bookedOn = new Date(s.createdAt);
      const daysElapsed = Math.floor(
        (now.getTime() - bookedOn.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysElapsed < minDays) continue;
      out.push({
        saleId: s.id,
        invoiceNo: s.invoiceNo,
        customerId: s.customerId,
        customerName: s.customer?.name ?? 'Walk-in',
        customerPhone: s.customer?.phone,
        bookedOn: bookedOn.toISOString(),
        daysElapsed,
        remainingDue: Number(Number(s.dueAmount ?? 0).toFixed(2)),
        paidSoFar: Number(Number(s.amountPaidSettled ?? s.paidAmount ?? 0).toFixed(2)),
        serials: byInvoice.get(s.invoiceNo) ?? [],
      });
    }
    out.sort((a, b) => b.daysElapsed - a.daysElapsed);
    return out;
  }

  /**
   * Release-to-Floor: cancels a stuck booking and reverts the held serials
   * back to AVAILABLE so they can be sold to a fresh customer. The advance
   * already paid is NOT auto-refunded — it stays as a customer-credit on
   * their ledger (the owner can refund it manually via a Receipt-reversal
   * + a separate cash-book OUT entry).
   *
   * Mechanics:
   *   1. Re-uses the existing sale-reversal pipeline for the accounting
   *      half (Cr A/R + Cr Deferred Receivables + Dr Revenue, etc.). The
   *      reversal call is idempotent; safe to re-press the button.
   *   2. The `unbindFromInvoice` call inside reverse() flips BOOKED ↦
   *      AVAILABLE automatically — that's the rule we already wired in
   *      Phase 2D.
   *   3. Adds a marker reason "RELEASE-TO-FLOOR" so the audit log distinguishes
   *      this from a "wrong invoice" reversal.
   */
  async releaseBooking(
    saleId: string,
    opts: { userId?: string; reason?: string },
  ): Promise<Sale> {
    const reason = (opts.reason ?? '').trim() ||
      'Release-to-floor: booking expired without final payment';
    return this.reverse(saleId, {
      userId: opts.userId,
      reason: `RELEASE-TO-FLOOR · ${reason}`,
    });
  }

  async settleCommitment(
    saleId: string,
    args: {
      commitmentIndex: number;
      accountId: string;
      amount: number;
      paidOn?: string;
      notes?: string;
    },
  ): Promise<Sale> {
    if (args.amount <= 0) {
      throw new BadRequestException('Settlement amount must be positive.');
    }
    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const sale = await saleRepo.findOne({ where: { id: saleId } });
      if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
      if (!sale.paymentCommitments || sale.paymentCommitments.length === 0) {
        throw new BadRequestException('Sale has no deferred commitments.');
      }
      const idx = args.commitmentIndex;
      const c = sale.paymentCommitments[idx];
      if (!c) {
        throw new BadRequestException(`Commitment #${idx} does not exist.`);
      }
      if (c.status === 'PAID') return sale;

      // Cap the settlement at the remaining residual on this commitment so
      // an over-payment doesn't write a negative balance. The cashier can
      // still receive the surplus via a normal RCT voucher against the
      // customer (customer credit), which is the right primitive.
      const alreadyOnThis = Number(c.actualAmount ?? 0);
      const remainingOnThis = Number(c.expectedAmount) - alreadyOnThis;
      const applied = Math.min(args.amount, remainingOnThis);
      const overflow = args.amount - applied;

      // Post a Receipt voucher so the customer ledger updates naturally.
      const seq = await this.sequences.next('RCT', () =>
        manager.getRepository(Payment).count(),
      );
      const voucher = manager.create(Payment, {
        voucherNo: seq,
        direction: 'IN' as const,
        accountId: args.accountId,
        customerId: sale.customerId,
        amount: applied,
        referenceType: 'SALE_COMMITMENT',
        referenceId: sale.id,
        notes: args.notes ?? `Settles commitment #${idx} of ${sale.invoiceNo}`,
      });
      await manager.getRepository(Payment).save(voucher);

      // Journal: Dr Cash/Bank → Cr Deferred Cash Receivables. The original
      // sale parked the residual on the Deferred Cash account; this entry
      // moves it to real money.
      const sysDeferred = await this.accounts.findSystem('DEFERRED_RECEIVABLE');
      await this.journals.post(
        {
          entryDate: new Date(),
          sourceModule: 'PAYMENT',
          sourceRef: seq,
          description: `Settlement of ${sale.invoiceNo} commitment #${idx}`,
          lines: [
            {
              accountId: args.accountId,
              debit: applied,
              narration: `Receipt against ${sale.invoiceNo}`,
            },
            {
              accountId: sysDeferred.id,
              credit: applied,
              narration: `Clears deferred portion of ${sale.invoiceNo}`,
            },
          ],
        },
        manager,
      );

      // Update the commitment entry. Mark PAID only if fully covered now.
      const nextActual = alreadyOnThis + applied;
      c.actualAmount = Number(nextActual.toFixed(2));
      c.actualPaymentDate = args.paidOn ?? new Date().toISOString().slice(0, 10);
      c.receiptVoucherNo = seq;
      if (nextActual >= Number(c.expectedAmount) - 0.005) {
        c.status = 'PAID';
      }
      sale.paymentCommitments = [...sale.paymentCommitments];
      sale.paymentCommitments[idx] = c;
      sale.amountPaidSettled = Number(
        (Number(sale.amountPaidSettled) + applied).toFixed(2),
      );
      // The sale's outstanding `dueAmount` also drops by what we just took
      // — keeps the customer-balance view and the A/R reports in sync.
      sale.dueAmount = Math.max(
        0,
        Number((Number(sale.dueAmount) - applied).toFixed(2)),
      );
      const saved = await saleRepo.save(sale);

      // If the sale is now fully paid AND any of its serials are still
      // BOOKED, the unit becomes deliverable — flip them to DELIVERED so
      // the Strict-Handover guard in DeliveriesService allows the truck out.
      if (sale.dueAmount <= 0.005) {
        await this.itemSerials.markDelivered(sale.invoiceNo, manager);
      }

      // Surface the overflow back to the caller so the UI can route it to
      // an open-credit voucher instead of silently dropping it.
      (saved as Sale & { overflow?: number }).overflow = overflow > 0 ? overflow : undefined;
      return saved;
    });
  }
}

/**
 * Build the commitments JSON for a fresh sale. Precedence:
 *   1. Explicit `paymentCommitments[]` from the caller (must sum to the
 *      residual within rounding; the service balances any leftover into a
 *      final synthetic entry rather than silently rejecting the sale — the
 *      cashier always wins on the till).
 *   2. Legacy `expectedPaymentDate` → one commitment for the full residual.
 *   3. Neither → no commitments (residual lands as plain A/R, no promise).
 */
function buildCommitments(
  residual: number,
  dto: CreateSaleDto,
): SalePaymentCommitment[] | undefined {
  if (dto.paymentCommitments && dto.paymentCommitments.length > 0) {
    const list: SalePaymentCommitment[] = dto.paymentCommitments.map((c) => ({
      dueDate: c.dueDate,
      expectedAmount: Number(c.expectedAmount.toFixed(2)),
      status: 'PENDING',
      notes: c.notes,
    }));
    const sum = list.reduce((s, c) => s + c.expectedAmount, 0);
    const diff = Number((residual - sum).toFixed(2));
    if (Math.abs(diff) > 0.005) {
      const last = list[list.length - 1];
      last.expectedAmount = Number((last.expectedAmount + diff).toFixed(2));
    }
    return list;
  }
  if (dto.expectedPaymentDate) {
    return [
      {
        dueDate: dto.expectedPaymentDate,
        expectedAmount: residual,
        status: 'PENDING',
      },
    ];
  }
  return undefined;
}
