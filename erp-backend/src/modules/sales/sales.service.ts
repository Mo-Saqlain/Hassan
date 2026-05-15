import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { StockService } from '../stock/stock.service';
import { Item } from '../items/entities/item.entity';
import { OutboxService } from '../outbox/outbox.service';
import { SequenceService } from '../sequences/sequence.service';
import { Customer } from '../customers/entities/customer.entity';
import { Payment } from '../payments/entities/payment.entity';
import { JournalService } from '../journals/journal.service';
import { AccountsService } from '../accounts/accounts.service';

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
    const saved = await this.dataSource.transaction(async (manager) => {
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
        totalCogs += Number(item.purchasePrice) * line.quantity;

        const sl = manager.create(SaleItem, {
          itemId: item.id,
          quantity: line.quantity,
          unitPrice,
          lineTotal,
        });
        lines.push(sl);
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
        journalLines.push({
          accountId: sysAR.id,
          debit: dueAmount,
          narration: `Sale ${invoiceNo} on credit`,
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
    });

    // Local-first nodes (those configured with CLOUD_SYNC_URL) enqueue
    // every locally-originated sale for the background worker to push.
    // skipOutbox is true when this create() is called from the cloud receiver.
    if (!opts?.skipOutbox && process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('SALE_CREATED', { ...dto, invoiceNo: saved.invoiceNo });
    }

    return saved;
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

      // Reverse the stock OUTs with corresponding INs.
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
      }

      sale.reversedAt = new Date();
      sale.reversedBy = opts.userId;
      sale.reversalReason = opts.reason;
      return saleRepo.save(sale);
    });
  }
}
