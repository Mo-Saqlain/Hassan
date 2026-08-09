import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
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
import { RecostService } from '../costing/recost.service';
import {
  applySearch,
  ListQuery,
  Page,
  paginate,
} from '../../common/search';
import { PeriodsService } from '../periods/periods.service';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { ServiceTicket } from '../service-tickets/entities/service-ticket.entity';
import { Delivery } from '../deliveries/entities/delivery.entity';

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
    private readonly recost: RecostService,
    private readonly periods: PeriodsService,
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
  async createInTransaction(
    manager: EntityManager,
    dto: CreateSaleDto,
    opts?: { skipCreditGate?: boolean; replacing?: Sale },
  ): Promise<Sale> {
      const itemRepo = manager.getRepository(Item);
      const saleRepo = manager.getRepository(Sale);

      let totalAmount = 0;
      let totalCogs = 0;
      const lines: SaleItem[] = [];
      // itemId → Item, so the warranty snapshot below can read each line's
      // cover config without a second round-trip to the repo.
      const lineItems = new Map<string, Item>();

      for (const line of dto.lines) {
        const item = await itemRepo.findOne({ where: { id: line.itemId } });
        if (!item) {
          throw new NotFoundException(`Item ${line.itemId} not found`);
        }
        lineItems.set(item.id, item);
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

      // An edit re-applies onto the SAME row, so it keeps the original number
      // rather than burning a new one from the sequence.
      const invoiceNo =
        opts?.replacing?.invoiceNo ??
        dto.invoiceNo ??
        (await this.nextInvoiceNo(saleRepo));

      // Sales paid in cash/card/bank credit a specific account (cash drawer,
      // bank wallet, etc.). CREDIT-method sales must not pin an account —
      // nothing is collected yet, the whole amount sits as A/R.
      const paymentMethod = dto.paymentMethod ?? 'CASH';
      const accountId = paymentMethod === 'CREDIT' ? undefined : dto.accountId;

      // Credit-limit gate: any sale that leaves money owed (CREDIT or
      // partial-pay) must respect the customer's creditEnabled flag and
      // their creditLimit. Blocks the sale before stock is moved.
      //
      // skipCreditGate is set by the exchange flow: the residual there is
      // backed by the store credit from the give-back leg (created in the same
      // transaction), not open debt — so the ordinary creditEnabled/limit
      // gate would wrongly block a legitimate like-for-like swap.
      if (dueAmount > 0 && dto.customerId && !opts?.skipCreditGate) {
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

      const fields = {
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
      };

      // Editing re-applies onto the original row: same id, same invoice number,
      // same created_at. The old lines are dropped first — they were already
      // unwound by the caller (stock put back, journal reversed, serials
      // unbound), so what remains is to replace them.
      let sale: Sale;
      if (opts?.replacing) {
        await manager.getRepository(SaleItem).delete({ saleId: opts.replacing.id });
        // Object.assign, not repo.merge: merge folds the incoming `lines` into
        // the entity's existing array, so the old line objects survive in memory
        // and the cascade re-inserts them — producing a sale with both the old
        // and the corrected lines, and a duplicate stock movement to match.
        // Assigning replaces the array outright.
        sale = Object.assign(opts.replacing, fields);
        sale.lines = lines;
        // Drop the eagerly-loaded relation objects. They still point at the
        // ORIGINAL customer/store/account, and TypeORM lets a loaded relation
        // win over the raw FK column — so re-pointing customerId while a stale
        // `customer` object hangs off the entity writes NULL instead. Clearing
        // them makes the FKs above authoritative.
        sale.customer = undefined;
        sale.store = undefined;
        sale.account = undefined;
      } else {
        sale = saleRepo.create(fields);
      }
      const persisted = await saleRepo.save(sale);

      // Freeze the line-level warranty window now that we have the real sale
      // date. Non-serialised (model-only) items have no per-unit ItemSerial to
      // carry warranty, so this snapshot IS their warranty record — the thing
      // the receipt prints and the by-invoice / by-customer / by-model lookups
      // resolve against. Serialised lines get it too as a detach-proof mirror.
      // Warranty starts on the sale date: a model-only item has no booking-hold
      // mechanic (no serials to reserve), so the goods leave with the receipt.
      const warrantyLines = persisted.lines.filter((ln) => {
        const it = lineItems.get(ln.itemId);
        return (
          it?.hasWarranty &&
          (it.warrantyType === 'COMPANY' || it.warrantyType === 'SHOP') &&
          Number(it.warrantyDays) > 0
        );
      });
      if (warrantyLines.length > 0) {
        const lineRepo = manager.getRepository(SaleItem);
        for (const ln of warrantyLines) {
          const it = lineItems.get(ln.itemId)!;
          const start = new Date(persisted.createdAt);
          const end = new Date(start);
          end.setDate(end.getDate() + Number(it.warrantyDays));
          ln.warrantyType = it.warrantyType;
          ln.warrantyDays = it.warrantyDays ?? undefined;
          ln.warrantyStartAt = start;
          ln.warrantyEndAt = end;
        }
        await lineRepo.save(warrantyLines);
      }

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
  /**
   * Correct a voucher sale in place — same invoice number, same row, including
   * its receipt splits.
   *
   * A voucher sale is a Sale plus N receipt rows (`referenceType: 'SALE_SPLIT'`),
   * each with its own journal entry. `edit()` re-posts only the Sale, so using it
   * here would leave the old receipts standing and count the money twice — which
   * is why `assertEditable` refuses a split-bearing sale and points at this
   * method instead.
   *
   * The splits are REVERSED rather than deleted: a receipt the customer was given
   * a number for should stay on the record, and now that reversed vouchers are
   * excluded from the ledgers, a reversed split correctly stops counting. The
   * corrected voucher then issues fresh receipts.
   */
  async editFromVoucher(
    id: string,
    dto: CreateSaleVoucherDto,
    opts: { reason: string; userId?: string },
  ): Promise<{ sale: Sale; receipts: Payment[] }> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('An edit needs a reason.');
    }
    const reason = opts.reason.trim();
    // Same pre-flight the create path runs, outside the transaction.
    await this.validateVoucher(dto);

    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const original = await saleRepo.findOne({
        where: { id },
        relations: ['lines'],
      });
      if (!original) throw new NotFoundException(`Sale ${id} not found`);

      await this.assertEditable(manager, original, { allowSplits: true });

      // 1. Reverse the old splits: balance out each receipt's journal entry and
      //    mark the row, so neither the cash account nor A/R keeps its effect.
      const paymentRepo = manager.getRepository(Payment);
      const oldSplits = await paymentRepo.find({
        where: {
          referenceType: 'SALE_SPLIT',
          referenceId: original.id,
          reversedAt: IsNull(),
        },
      });
      for (const split of oldSplits) {
        const entry = await this.journals.findActiveBySource(
          'PAYMENT',
          split.voucherNo,
          manager,
        );
        if (entry) {
          await this.journals.reverse(
            entry.id,
            {
              entryDate: new Date(),
              description: `Reversal of ${split.voucherNo}`,
              reason: `Edit of ${original.invoiceNo}: ${reason}`,
            },
            manager,
          );
        }
        split.reversedAt = new Date();
        split.reversedBy = opts.userId;
        split.reversalReason = `Edit of ${original.invoiceNo}: ${reason}`;
        await paymentRepo.save(split);
      }

      // 2. Unwind the sale itself.
      await this.unwindSaleEffects(manager, original, `Edit: ${reason}`);

      // 3. Re-apply the corrected voucher onto the same row.
      const result = await this.voucherInTransaction(manager, dto, {
        replacing: original,
      });

      result.sale.editCount = Number(original.editCount ?? 0) + 1;
      result.sale.lastEditedAt = new Date();
      result.sale.lastEditReason = reason;
      const saved = await saleRepo.save(result.sale);

      await this.recost.recomputeItems(
        [
          ...original.lines.map((l) => l.itemId),
          ...dto.lines.map((l) => l.itemId),
        ],
        { manager },
      );

      if (process.env.CLOUD_SYNC_URL) {
        await this.outbox.enqueue(
          'SALE_UPDATED',
          { ...dto, invoiceNo: saved.invoiceNo, editReason: reason },
          manager,
        );
      }

      return { sale: saved, receipts: result.receipts };
    });
  }

  /**
   * Voucher-shape validation: split sums, per-split account/kind coupling, and
   * per-line serial counts. Runs BEFORE any transaction so a bad payload throws
   * without burning a sequence number — and is shared by create and edit so a
   * correction cannot produce a voucher create would have rejected.
   */
  private async validateVoucher(dto: CreateSaleVoucherDto) {
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

    // Per-split shape check. The DTO marks `accountId` and `kind` both
    // optional so the JSON parser is lenient; this block enforces the
    // actual coupling: CASH must carry an accountId, CUSTOMER_CREDIT
    // must NOT carry one and requires a customer on the voucher header.
    const ccSplitTotal = (dto.splits ?? [])
      .filter((s) => s.kind === 'CUSTOMER_CREDIT')
      .reduce((s, x) => s + Number(x.amount || 0), 0);
    for (const sp of dto.splits ?? []) {
      const kind = sp.kind ?? 'CASH';
      if (kind === 'CASH' && !sp.accountId) {
        throw new BadRequestException(
          'Cash/Bank/Wallet splits need a destination account.',
        );
      }
      if (kind === 'CUSTOMER_CREDIT') {
        if (!dto.customerId) {
          throw new BadRequestException(
            'Customer credit can only be applied when the voucher names a customer.',
          );
        }
        if (sp.accountId) {
          throw new BadRequestException(
            'Customer-credit splits must not carry an accountId — credit applies against the customer ledger, not a cash account.',
          );
        }
      }
    }

    // Pre-flight serial validation — runs BEFORE the transaction so a bad
    // serials list throws cleanly without leaving an orphan sequence number.
    // We need each line's Item to know if tracksSerials / serialRequiredOnSale
    // applies, so resolve all of them up-front and cache.
    const itemIds = Array.from(new Set(dto.lines.map((l) => l.itemId)));
    const items = await this.dataSource
      .getRepository(Item)
      .findBy({ id: In(itemIds) });
    const itemMap = new Map(items.map((i) => [i.id, i]));
    for (const ln of dto.lines) {
      const it = itemMap.get(ln.itemId);
      if (!it || !it.tracksSerials) continue;
      const provided = (ln.serials ?? []).map((s) => s.trim()).filter(Boolean);
      if (it.serialRequiredOnSale && provided.length !== ln.quantity) {
        throw new BadRequestException(
          `${it.name}: ${ln.quantity} serial number${ln.quantity === 1 ? '' : 's'} required (got ${provided.length}). One serial per unit.`,
        );
      }
      if (
        !it.serialRequiredOnSale &&
        provided.length > 0 &&
        provided.length !== ln.quantity
      ) {
        throw new BadRequestException(
          `${it.name}: either supply ${ln.quantity} serial${ln.quantity === 1 ? '' : 's'} (one per unit) or leave the box empty.`,
        );
      }
      if (new Set(provided).size !== provided.length) {
        throw new BadRequestException(
          `${it.name}: duplicate serial numbers within the line.`,
        );
      }
    }

  }
  async createFromVoucher(
    dto: CreateSaleVoucherDto,
  ): Promise<{ sale: Sale; receipts: Payment[] }> {
    await this.validateVoucher(dto);
    const result = await this.dataSource.transaction((manager) =>
      this.voucherInTransaction(manager, dto),
    );

    if (process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('SALE_VOUCHER_CREATED', {
        ...dto,
        invoiceNo: result.sale.invoiceNo,
      });
    }

    return result;
  }

  /**
   * Voucher body — Sale + receipt splits — scoped to a caller's EntityManager so
   * an edit can re-apply a corrected voucher through the same code that posts a
   * new one. Emits no outbox event; the caller owns that.
   *
   * With `opts.replacing` the Sale is written onto that existing row (same
   * invoice number, same id) and fresh receipts are issued for the corrected
   * splits. The caller must already have reversed the old splits and unwound the
   * sale.
   */
  async voucherInTransaction(
    manager: EntityManager,
    dto: CreateSaleVoucherDto,
    opts?: { replacing?: Sale },
  ): Promise<{ sale: Sale; receipts: Payment[] }> {
    return (async () => {
      // Recomputed here rather than passed in: they are pure functions of the
      // dto, and both entry points (create and edit) need them.
      const splitTotal = (dto.splits ?? []).reduce(
        (s, x) => s + Number(x.amount || 0),
        0,
      );
      const grossTotal = (dto.lines ?? []).reduce(
        (s, l) => s + Number(l.unitPrice || 0) * Number(l.quantity || 0),
        0,
      );
      const netTotal = Number((grossTotal - (dto.discount ?? 0)).toFixed(2));
      const ccSplitTotal = (dto.splits ?? [])
        .filter((s) => s.kind === 'CUSTOMER_CREDIT')
        .reduce((s, x) => s + Number(x.amount || 0), 0);
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
      const sale = await this.createInTransaction(manager, baseDto, {
        replacing: opts?.replacing,
      });

      // 2a. CUSTOMER_CREDIT splits — cap by the customer's pre-sale available
      //     credit. The helper measures `opening + sum(due) - sum(receipts)`;
      //     a negative figure is credit, so available = max(0, -outstanding).
      //     This runs against the manager AFTER the Sale has been written,
      //     so we adjust by netTotal (which was just added to A/R) to recover
      //     the pre-sale figure.
      if (ccSplitTotal > 0 && dto.customerId) {
        const postSaleOutstanding = await this.customerOutstanding(
          manager,
          dto.customerId,
        );
        const preSaleOutstanding = postSaleOutstanding - netTotal;
        const availableCredit = Math.max(0, -preSaleOutstanding);
        if (ccSplitTotal > availableCredit + 0.005) {
          throw new BadRequestException(
            `Customer credit (${availableCredit.toFixed(2)}) is less than the credit splits (${ccSplitTotal.toFixed(2)}). Reduce the credit split or top it up with cash.`,
          );
        }
      }

      // 2b. Per-split: a normal Receipt voucher row + a balancing journal
      //     Dr <accountId> / Cr A/R (or Deferred). CUSTOMER_CREDIT splits
      //     skip both — the prior advance receipt already moved cash and
      //     credited A/R; posting a second pair here would double-count.
      //     Both kinds still reduce Sale.dueAmount in step 3 below so the
      //     Sale-level "settled" status reads honest.
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
        if ((split.kind ?? 'CASH') === 'CUSTOMER_CREDIT') continue;
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
                accountId: split.accountId!,
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
      //    numbers. Sale.dueAmount drops by the total splits collected.
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
      }

      // 4. Bind tracked serials — same dueAmount-branched policy POS uses:
      //    full pay (dueAmount ≈ 0) → bindToSale per serial (DELIVERED +
      //    warranty stamp); residual remains → reserveForBooking (BOOKED,
      //    physical status stays IN_STOCK on the floor). Done after the
      //    splits land so the branch sees the final dueAmount, not the
      //    pre-split residual that always equals netTotal.
      const isBooking =
        dto.isBooked !== undefined
          ? dto.isBooked
          : Number(sale.dueAmount ?? 0) > 0.005;
      // Resolved here (rather than reusing the caller's pre-flight cache) so the
      // body stands on its own — both create and edit enter through it.
      const itemMap = new Map(
        (
          await manager
            .getRepository(Item)
            .findBy({ id: In(Array.from(new Set(dto.lines.map((l) => l.itemId)))) })
        ).map((i) => [i.id, i]),
      );
      for (const ln of dto.lines) {
        const it = itemMap.get(ln.itemId);
        if (!it || !it.tracksSerials) continue;
        const provided = (ln.serials ?? [])
          .map((s) => s.trim())
          .filter(Boolean);
        if (provided.length === 0) continue;
        if (isBooking) {
          await this.itemSerials.reserveForBooking(
            {
              serials: provided,
              itemId: ln.itemId,
              saleInvoiceNo: sale.invoiceNo,
              soldToCustomerId: dto.customerId,
              bookedAt: sale.createdAt,
            },
            manager,
          );
        } else {
          for (const serial of provided) {
            await this.itemSerials.bindToSale(
              {
                serial,
                itemId: ln.itemId,
                saleInvoiceNo: sale.invoiceNo,
                soldAt: sale.createdAt,
                soldToCustomerId: dto.customerId,
                warrantyDays: it.hasWarranty
                  ? it.warrantyDays ?? undefined
                  : undefined,
                warrantyType: it.hasWarranty
                  ? it.warrantyType ?? undefined
                  : undefined,
              },
              manager,
            );
          }
        }
      }

      return { sale, receipts };
    })();
  }

  private async nextInvoiceNo(repo: Repository<Sale>): Promise<string> {
    return this.sequences.next('INV', () => repo.count());
  }

  /**
   * Searchable, paged sale history.
   *
   * `findAll()` below returns every sale with its lines and eager relations and
   * no limit, which is what the history page still uses. That is fine for a shop
   * with a few hundred invoices and steadily less fine after that, and it forced
   * the UI to filter client-side — so it could only search what it had already
   * downloaded. This is the endpoint to move that page onto.
   */
  async search(query: ListQuery): Promise<Page<Sale>> {
    const qb = this.sales
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'customer')
      .orderBy('s.createdAt', 'DESC');
    return paginate(
      applySearch(qb, query.search, [
        's.invoice_no',
        's.payment_method',
        's.notes',
        'customer.name',
        'customer.phone',
      ]),
      query,
    );
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
   * Receipt-backed warranty lookup for model-only items. Where the serial
   * route (`/item-serials/warranty/:serial`) resolves a single physical unit,
   * these resolve the warranty stamped onto the *sale line* — the trail we
   * keep for items that ship without a per-unit serial. Three entry points
   * cover the counter cases:
   *   - by invoice  → customer brought the stamped receipt
   *   - by customer → receipt lost, look the buyer up in our DB
   *   - by model    → buyer not in the system, find sales of the model
   *
   * `buildLineCard` produces the same shape for all three so the UI renders
   * one card component.
   */
  private buildLineCard(sale: Sale, ln: SaleItem) {
    const end = ln.warrantyEndAt ? new Date(ln.warrantyEndAt) : null;
    return {
      saleId: sale.id,
      invoiceNo: sale.invoiceNo,
      soldAt: sale.createdAt,
      customerId: sale.customerId ?? null,
      customerName: sale.customer?.name ?? null,
      customerPhone: sale.customer?.phone ?? null,
      saleItemId: ln.id,
      itemId: ln.itemId,
      modelNo: ln.item?.modelNo ?? null,
      itemName: ln.item?.name ?? ln.itemId,
      tracksSerials: !!ln.item?.tracksSerials,
      quantity: ln.quantity,
      warrantyType: ln.warrantyType ?? null,
      warrantyDays: ln.warrantyDays ?? null,
      warrantyStartAt: ln.warrantyStartAt ?? null,
      warrantyEndAt: end,
      dueAmount: Number(sale.dueAmount ?? 0),
      active:
        end != null &&
        end > new Date() &&
        ln.warrantyType !== 'NONE' &&
        ln.warrantyType !== 'CHECKING_ONLY',
    };
  }

  async warrantyByInvoice(invoiceNo: string) {
    const sale = await this.sales.findOne({
      where: { invoiceNo: invoiceNo.trim() },
    });
    if (!sale) return null;
    return {
      invoiceNo: sale.invoiceNo,
      soldAt: sale.createdAt,
      customerName: sale.customer?.name ?? null,
      lines: (sale.lines ?? []).map((ln) => this.buildLineCard(sale, ln)),
    };
  }

  async warrantyByCustomer(customerId: string) {
    const sales = await this.sales.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return sales.flatMap((sale) =>
      (sale.lines ?? []).map((ln) => this.buildLineCard(sale, ln)),
    );
  }

  async warrantyByModel(itemId: string, from?: string, to?: string) {
    if (!itemId) return [];
    const qb = this.sales
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.lines', 'line')
      .leftJoinAndSelect('line.item', 'item')
      .leftJoinAndSelect('sale.customer', 'customer')
      .where('line.itemId = :itemId', { itemId });
    // Bind Date objects, not interpolated strings — TypeORM formats them per
    // driver, sidestepping the SQLite 'T'-vs-space ISO mismatch that makes a
    // string compare drop same-day rows.
    if (from) qb.andWhere('sale.createdAt >= :from', { from: new Date(from) });
    if (to) {
      qb.andWhere('sale.createdAt <= :to', {
        to: new Date(`${to}T23:59:59.999`),
      });
    }
    const sales = await qb.orderBy('sale.createdAt', 'DESC').take(200).getMany();
    // The join pulls every line of a matching sale; keep only the model asked
    // for so a mixed-basket receipt doesn't leak unrelated lines.
    return sales.flatMap((sale) =>
      (sale.lines ?? [])
        .filter((ln) => ln.itemId === itemId)
        .map((ln) => this.buildLineCard(sale, ln)),
    );
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
  /**
   * Correct a sale that was entered wrongly — any field, any line — keeping the
   * same invoice number and the same row.
   *
   * Mechanism: unwind everything the original posted (journal entry reversed,
   * stock movements mirrored back, serials unbound, costedQty restored), then
   * re-apply the corrected version through the ordinary create path onto that
   * same row. Nothing is destructively rewritten: the stock ledger and the
   * journal both keep the original, its unwind, and the correction, so the
   * history reads as what happened. Every figure the shop looks at is computed
   * from documents, so ledgers and balances follow immediately; the cost basis
   * is re-derived at the end.
   *
   * Refused rather than half-done when something downstream would be left
   * dangling — see the guards below, each of which names its blocker.
   */
  async edit(
    id: string,
    dto: CreateSaleDto,
    opts: { reason: string; userId?: string },
  ): Promise<Sale> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('An edit needs a reason.');
    }
    const reason = opts.reason.trim();

    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const original = await saleRepo.findOne({
        where: { id },
        relations: ['lines'],
      });
      if (!original) throw new NotFoundException(`Sale ${id} not found`);

      await this.assertEditable(manager, original);

      // 1. Unwind. Same steps as a reversal, minus the reversedAt flag: this
      //    invoice is being corrected, not voided.
      await this.unwindSaleEffects(manager, original, `Edit: ${reason}`);

      // 2. Re-apply the corrected sale onto the same row.
      const edited = await this.createInTransaction(manager, dto, {
        replacing: original,
        // The residual is re-checked against the customer's limit by the create
        // path, which is what we want — an edit that pushes them over the limit
        // should be refused just like a new sale would be.
      });

      edited.editCount = Number(original.editCount ?? 0) + 1;
      edited.lastEditedAt = new Date();
      edited.lastEditReason = reason;
      const saved = await saleRepo.save(edited);

      // 3. Recost every item involved — the ones that left the sale as well as
      //    the ones that joined it.
      const touched = [
        ...original.lines.map((l) => l.itemId),
        ...dto.lines.map((l) => l.itemId),
      ];
      await this.recost.recomputeItems(touched, { manager });

      // Enqueued inside the transaction so a failed edit can't leave the cloud
      // an event for a correction that didn't happen. Only when a cloud is
      // configured, matching create().
      if (process.env.CLOUD_SYNC_URL) {
        await this.outbox.enqueue(
          'SALE_UPDATED',
          { ...dto, invoiceNo: saved.invoiceNo, editReason: reason },
          manager,
        );
      }

      return saved;
    });
  }

  /**
   * Blockers for editing a posted sale. Each one exists because the alternative
   * is a document that disagrees with something pointing at it.
   */
  private async assertEditable(
    manager: EntityManager,
    sale: Sale,
    opts?: { allowSplits?: boolean },
  ) {
    // A voucher sale carries its payment as separate SALE_SPLIT receipt rows
    // with their own journal entries. `edit()` re-posts only the Sale, so it
    // would leave those receipts standing against a changed total and count the
    // money twice. `editFromVoucher` reverses them first, and passes
    // allowSplits.
    if (!opts?.allowSplits) {
      const splits = await manager.getRepository(Payment).count({
        where: {
          referenceType: 'SALE_SPLIT',
          referenceId: sale.id,
          reversedAt: IsNull(),
        },
      });
      if (splits > 0) {
        throw new BadRequestException(
          `Sale ${sale.invoiceNo} was entered as a voucher with ${splits} payment split(s). Correct it through the Sales Voucher screen (PATCH /sales/voucher/:id) so the receipts are re-issued with it.`,
        );
      }
    }

    if (sale.reversedAt) {
      throw new BadRequestException(
        `Sale ${sale.invoiceNo} is reversed. A reversed voucher is finished — enter a new sale instead of editing this one.`,
      );
    }

    // Hard-closed periods are closed for a reason: their numbers have been
    // reported. Corrections belong in an open period.
    await this.periods.assertOpen(new Date(sale.createdAt));

    // A return against this sale was priced off its lines; changing them under
    // the return would leave the credit referring to quantities that no longer
    // exist.
    const returnCount = await manager.getRepository(SaleReturn).count({
      where: { saleId: sale.id, reversedAt: IsNull() },
    });
    if (returnCount > 0) {
      throw new BadRequestException(
        `Sale ${sale.invoiceNo} has ${returnCount} return(s) booked against it. Reverse the return(s) first, then edit the sale.`,
      );
    }

    // Service tickets point at a specific sale LINE. Replacing the lines would
    // orphan the ticket's link to what was sold.
    const lineIds = sale.lines.map((l) => l.id);
    if (lineIds.length > 0) {
      const ticketCount = await manager
        .getRepository(ServiceTicket)
        .count({ where: { saleItemId: In(lineIds) } });
      if (ticketCount > 0) {
        throw new BadRequestException(
          `Sale ${sale.invoiceNo} has ${ticketCount} service ticket(s) linked to its lines. Unlink or close them before editing.`,
        );
      }
    }

    // A delivery holds a reservation derived from this sale's lines, so editing
    // them would leave Item.reservedQty describing goods that aren't on the
    // invoice any more.
    const deliveryCount = await manager.getRepository(Delivery).count({
      where: { saleId: sale.id },
    });
    if (deliveryCount > 0) {
      throw new BadRequestException(
        `Sale ${sale.invoiceNo} has ${deliveryCount} delivery record(s). Delete or complete them before editing the sale.`,
      );
    }

    // Money collected after the fact against a commitment schedule was applied
    // to THIS residual; changing the total could make the settled amount exceed
    // what is now owed.
    if (Number(sale.amountPaidSettled ?? 0) > Number(sale.paidAmount ?? 0) + 0.005) {
      throw new BadRequestException(
        `Sale ${sale.invoiceNo} has instalments settled against it. Reverse those receipts first, then edit the sale.`,
      );
    }
  }

  /**
   * The undo half shared by reversal and editing: balance out the journal, mirror
   * the stock back, hand the serials back, restore the costed quantity.
   */
  private async unwindSaleEffects(
    manager: EntityManager,
    sale: Sale,
    note: string,
  ) {
    const originalEntry = await this.journals.findActiveBySource('SALE', sale.invoiceNo, manager);
    if (originalEntry) {
      await this.journals.reverse(
        originalEntry.id,
        {
          entryDate: new Date(),
          description: `Reversal of sale ${sale.invoiceNo}`,
          reason: note,
        },
        manager,
      );
    }

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
          note: `${note} (${sale.invoiceNo})`,
        },
        manager,
      );
      const it = await itemRepo.findOne({ where: { id: ln.itemId } });
      if (it) {
        it.costedQty = Number(it.costedQty) + Number(ln.quantity);
        await itemRepo.save(it);
      }
    }

    await this.itemSerials.unbindFromInvoice(sale.invoiceNo, manager);
  }

  async reverse(
    id: string,
    opts: { userId?: string; reason: string },
  ): Promise<Sale> {
    return this.dataSource.transaction((manager) =>
      this.reverseInTransaction(manager, id, opts),
    );
  }

  /**
   * Reversal body scoped to a caller-supplied EntityManager, so a larger atomic
   * operation can unwind a sale as one of several legs — an exchange reversal
   * has to undo the replacement sale, the give-back return and any supplier
   * credit together or not at all.
   */
  async reverseInTransaction(
    manager: EntityManager,
    id: string,
    opts: { userId?: string; reason: string },
  ): Promise<Sale> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('Reversal requires a reason.');
    }
    return (async () => {
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
      const originalEntry = await this.journals.findActiveBySource('SALE', sale.invoiceNo, manager);
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
      const saved = await saleRepo.save(sale);

      // Re-derive cost from the surviving documents. A sale doesn't move
      // avgCost, so this is mostly about costedQty — but going through the same
      // replay as every other correction means there is one definition of the
      // cost basis rather than one per unwind path.
      await this.recost.recomputeItems(
        sale.lines.map((l) => l.itemId),
        { manager },
      );

      return saved;
    })();
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
