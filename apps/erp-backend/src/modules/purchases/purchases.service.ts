import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { StockService } from '../stock/stock.service';
import { Item } from '../items/entities/item.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import {
  ImportResult,
  num,
  str,
  validateDto,
} from '../../common/csv-import';
import { OutboxService } from '../outbox/outbox.service';
import { SequenceService } from '../sequences/sequence.service';
import { JournalService } from '../journals/journal.service';
import { AccountsService } from '../accounts/accounts.service';
import { ItemSerialsService } from '../item-serials/item-serials.service';
import { RecostService } from '../costing/recost.service';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
    private readonly sequences: SequenceService,
    private readonly journals: JournalService,
    private readonly accounts: AccountsService,
    private readonly itemSerials: ItemSerialsService,
    private readonly recost: RecostService,
  ) {}

  async create(
    dto: CreatePurchaseDto,
    opts?: { skipOutbox?: boolean },
  ): Promise<Purchase> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const purchaseRepo = manager.getRepository(Purchase);

      let totalAmount = 0;
      const lines: PurchaseItem[] = [];

      for (const line of dto.lines) {
        const item = await itemRepo.findOne({ where: { id: line.itemId } });
        if (!item) {
          throw new NotFoundException(`Item ${line.itemId} not found`);
        }
        const unitPrice = line.unitPrice;
        const lineTotal = Number((unitPrice * line.quantity).toFixed(2));
        totalAmount += lineTotal;

        // Per-line store; falls back to the purchase header's store.
        const lineStoreId = line.storeId ?? dto.storeId;

        const pl = manager.create(PurchaseItem, {
          itemId: item.id,
          storeId: lineStoreId,
          quantity: line.quantity,
          unitPrice,
          lineTotal,
        });
        lines.push(pl);
      }

      const discount = dto.discount ?? 0;
      const netAmount = Number((totalAmount - discount).toFixed(2));
      const paidAmount = dto.paidAmount ?? 0;
      const dueAmount = Number((netAmount - paidAmount).toFixed(2));

      const billNo = dto.billNo ?? (await this.nextBillNo(purchaseRepo));

      const purchase = purchaseRepo.create({
        billNo,
        supplierId: dto.supplierId,
        storeId: dto.storeId,
        totalAmount,
        discount,
        netAmount,
        paidAmount,
        dueAmount,
        paymentMethod: dto.paymentMethod ?? 'CASH',
        notes: dto.notes,
        lines,
      });
      const persisted = await purchaseRepo.save(purchase);

      for (let i = 0; i < persisted.lines.length; i += 1) {
        const ln = persisted.lines[i];
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: ln.storeId ?? dto.storeId,
            type: 'IN',
            quantity: ln.quantity,
            referenceType: 'PURCHASE',
            referenceId: persisted.id,
          },
          manager,
        );

        // Weighted-average cost roll-up. New avgCost is the value-weighted
        // mean of the existing stock and this batch:
        //   newAvg = (oldQty * oldAvg + inQty * unitPrice) / (oldQty + inQty)
        // When existing stock is zero we just take the batch price. The
        // `purchasePrice` field on the Item is kept for UI defaulting but
        // is no longer used for COGS.
        const itemForCost = await itemRepo.findOne({ where: { id: ln.itemId } });
        if (itemForCost) {
          const oldQty = Number(itemForCost.costedQty) || 0;
          const oldAvg = Number(itemForCost.avgCost) || 0;
          const inQty = Number(ln.quantity);
          const inCost = Number(ln.unitPrice);
          const newQty = oldQty + inQty;
          const newAvg =
            newQty > 0
              ? Number(
                  ((oldQty * oldAvg + inQty * inCost) / newQty).toFixed(2),
                )
              : 0;
          itemForCost.costedQty = newQty;
          itemForCost.avgCost = newAvg;
          itemForCost.purchasePrice = inCost; // latest-cost reference for UI
          await itemRepo.save(itemForCost);
        }

        // Optional per-line serial intake: the salesman can paste a list of
        // manufacturer serials into the form. Mismatched count vs quantity
        // is tolerated — the deficit gets filled at sale time, the surplus
        // is recorded as extra IN_STOCK rows. Duplicate serials within the
        // same paste are deduped server-side; cross-item collisions throw.
        const serials = dto.lines[i]?.serials ?? [];
        if (serials.length > 0) {
          await this.itemSerials.registerStock(
            {
              itemId: ln.itemId,
              serials,
              purchaseBillNo: persisted.billNo,
              purchasedAt: persisted.createdAt.toISOString(),
              purchasePrice: Number(ln.unitPrice),
              currentStoreId: ln.storeId ?? dto.storeId,
            },
            manager,
          );
        }
      }

      // Journal posting:
      //   Dr Inventory      (netAmount — stock value coming in)
      //   Cr Cash/Bank      (paidAmount — out of whichever account; falls back
      //                      to CASH_ON_HAND when the caller didn't pin one)
      //   Cr A/P            (dueAmount — supplier becomes a creditor)
      const sysInventory = await this.accounts.findSystem('INVENTORY');
      const sysAP = await this.accounts.findSystem('A_P');
      const sysCashFallback = await this.accounts.findSystem('CASH_ON_HAND');

      const journalLines: Array<{
        accountId: string;
        debit?: number;
        credit?: number;
        narration?: string;
      }> = [
        {
          accountId: sysInventory.id,
          debit: netAmount,
          narration: `Purchase ${billNo} inventory in`,
        },
      ];
      if (paidAmount > 0) {
        // Purchase header doesn't carry an explicit payment-source account
        // (unlike sales), so we default to the CASH_ON_HAND fallback for
        // the journal credit. The user can override by linking a separate
        // PMT-… voucher to the same supplier afterwards.
        journalLines.push({
          accountId: sysCashFallback.id,
          credit: paidAmount,
          narration: `Purchase ${billNo} cash paid`,
        });
      }
      if (dueAmount > 0) {
        journalLines.push({
          accountId: sysAP.id,
          credit: dueAmount,
          narration: `Purchase ${billNo} on credit`,
        });
      }
      await this.journals.post(
        {
          entryDate: persisted.createdAt,
          sourceModule: 'PURCHASE',
          sourceRef: billNo,
          description: `Purchase ${billNo}`,
          lines: journalLines,
        },
        manager,
      );

      return persisted;
    });

    if (!opts?.skipOutbox && process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('PURCHASE_CREATED', {
        ...dto,
        billNo: saved.billNo,
      });
    }

    return saved;
  }

  /**
   * Bulk-import purchase bills from parsed CSV rows — the supported way to load
   * opening stock without hand-entering a bill per item.
   *
   * The CSV is **one row per line item**. Rows sharing a non-blank `billNo`
   * collapse into a single multi-line bill (header fields — supplier, store,
   * discount, paidAmount, paymentMethod, notes — are read from that bill's
   * first row). A blank `billNo` makes the row its own single-line bill with an
   * auto `BILL-…` number. Supplier, store and item are referenced BY NAME, not
   * UUID:
   *   - `item`  → matched against SKU, then barcode, then model no, then name
   *   - `store` → store name (per line; falls back to the bill's header store)
   *   - `supplier` → supplier name (or code)
   *
   * Each bill is created through the normal transactional `create()`, so it
   * books the stock IN movement, rolls up weighted-average cost, captures any
   * serials, and posts the balanced journal — exactly like a hand-entered bill.
   * Failures are isolated per bill. Note: imported bills are dated now (the
   * Purchase entity has no historical-date field); fine for opening stock.
   */
  async importRows(rows: Record<string, unknown>[]): Promise<ImportResult> {
    const list = Array.isArray(rows) ? rows : [];

    // Name/code → id lookups, loaded once.
    const itemRows = await this.dataSource.getRepository(Item).find();
    const resolveItem = (ref: string): string | undefined => {
      const l = ref.toLowerCase();
      return (
        itemRows.find((it) => it.sku?.toLowerCase() === l)?.id ??
        itemRows.find((it) => it.barcode?.toLowerCase() === l)?.id ??
        itemRows.find((it) => it.modelNo?.toLowerCase() === l)?.id ??
        itemRows.find((it) => it.name?.toLowerCase() === l)?.id
      );
    };
    const supplierRows = await this.dataSource.getRepository(Supplier).find();
    const resolveSupplier = (ref: string): string | undefined => {
      const l = ref.toLowerCase();
      return (
        supplierRows.find((s) => s.name.toLowerCase() === l)?.id ??
        supplierRows.find((s) => s.code?.toLowerCase() === l)?.id
      );
    };
    const storeRows = await this.dataSource.getRepository(Store).find();
    const resolveStore = (ref: string): string | undefined =>
      storeRows.find((s) => s.name.toLowerCase() === ref.toLowerCase())?.id;

    // Group rows into bills, preserving the CSV line number of each.
    const groups = new Map<
      string,
      { billNo?: string; firstLine: number; rows: { raw: Record<string, unknown>; line: number }[] }
    >();
    let blankSeq = 0;
    list.forEach((raw, i) => {
      const line = i + 2; // header is line 1
      const billNo = str(raw.billNo);
      const key = billNo ? billNo.toLowerCase() : `__auto_${blankSeq++}`;
      if (!groups.has(key)) groups.set(key, { billNo, firstLine: line, rows: [] });
      groups.get(key)!.rows.push({ raw, line });
    });

    const result: ImportResult = { total: groups.size, created: 0, failed: [] };

    for (const g of groups.values()) {
      try {
        const head = g.rows[0].raw;

        let supplierId: string | undefined;
        const supplierName = str(head.supplier) ?? str(head.supplierName);
        if (supplierName) {
          supplierId = resolveSupplier(supplierName);
          if (!supplierId) throw new Error(`Supplier "${supplierName}" not found — import/create it first`);
        }

        let headerStoreId: string | undefined;
        const headStore = str(head.store);
        if (headStore) {
          headerStoreId = resolveStore(headStore);
          if (!headerStoreId) throw new Error(`Store "${headStore}" not found — import/create it first`);
        }

        const lines = g.rows.map(({ raw, line }) => {
          const itemRef = str(raw.item) ?? str(raw.sku) ?? str(raw.modelNo) ?? str(raw.barcode);
          if (!itemRef) throw new Error(`Line ${line}: "item" is required`);
          const itemId = resolveItem(itemRef);
          if (!itemId) throw new Error(`Line ${line}: item "${itemRef}" not found — import/create it first`);

          let storeId = headerStoreId;
          const storeRef = str(raw.store);
          if (storeRef) {
            storeId = resolveStore(storeRef);
            if (!storeId) throw new Error(`Line ${line}: store "${storeRef}" not found`);
          }

          const serialsRaw = str(raw.serials);
          const serials = serialsRaw
            ? serialsRaw.split(/[;|\n]/).map((s) => s.trim()).filter(Boolean)
            : undefined;

          return {
            itemId,
            storeId,
            quantity: num(raw.quantity) as number,
            unitPrice: (num(raw.unitPrice) ?? num(raw.cost) ?? num(raw.price)) as number,
            serials,
          };
        });

        const dto: CreatePurchaseDto = {
          billNo: g.billNo,
          supplierId,
          storeId: headerStoreId,
          discount: num(head.discount),
          paidAmount: num(head.paidAmount),
          paymentMethod: str(head.paymentMethod),
          notes: str(head.notes),
          lines,
        };
        await validateDto(CreatePurchaseDto, dto);
        await this.create(dto);
        result.created++;
      } catch (e) {
        result.failed.push({
          row: g.firstLine,
          label: g.billNo ?? '(auto bill)',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return result;
  }

  private async nextBillNo(repo: Repository<Purchase>): Promise<string> {
    return this.sequences.next('BILL', () => repo.count());
  }

  findAll() {
    return this.purchases.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const p = await this.purchases.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Purchase ${id} not found`);
    return p;
  }

  /**
   * Reverses a purchase: posts a balancing journal entry, books inverse
   * stock OUT movements, and marks the original row. The original purchase
   * stays visible with the REVERSED chip. Idempotent.
   */
  async reverse(
    id: string,
    opts: { userId?: string; reason: string },
  ): Promise<Purchase> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('Reversal requires a reason.');
    }
    return this.dataSource.transaction(async (manager) => {
      const purchaseRepo = manager.getRepository(Purchase);
      const p = await purchaseRepo.findOne({
        where: { id },
        relations: ['lines'],
      });
      if (!p) throw new NotFoundException(`Purchase ${id} not found`);
      if (p.reversedAt) return p;

      const originalEntry = await this.journals.findBySource('PURCHASE', p.billNo);
      if (originalEntry) {
        await this.journals.reverse(
          originalEntry.id,
          {
            entryDate: new Date(),
            description: `Reversal of purchase ${p.billNo}`,
            reason: opts.reason,
          },
          manager,
        );
      }

      const itemRepo = manager.getRepository(Item);
      for (const ln of p.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: ln.storeId ?? p.storeId,
            type: 'OUT',
            quantity: ln.quantity,
            referenceType: 'PURCHASE_REVERSAL',
            referenceId: p.id,
            note: `Reversal of ${p.billNo}: ${opts.reason}`,
          },
          manager,
        );
        const it = await itemRepo.findOne({ where: { id: ln.itemId } });
        if (it) {
          it.costedQty = Math.max(0, Number(it.costedQty) - Number(ln.quantity));
          await itemRepo.save(it);
        }
      }

      p.reversedAt = new Date();
      p.reversedBy = opts.userId;
      p.reversalReason = opts.reason;
      const saved = await purchaseRepo.save(p);

      // Now that this bill no longer counts, re-derive the weighted average
      // from the surviving documents. This is the fix for what used to be an
      // accepted inaccuracy: a running average cannot be un-rolled, so
      // reversing a mis-priced bill left avgCost overstated until enough later
      // purchases diluted it. The replay makes cost a pure function of the
      // documents that survive, which is also what makes editing them safe.
      // Same transaction — a failed reversal cannot leave a half-recosted item.
      await this.recost.recomputeItems(
        p.lines.map((l) => l.itemId),
        { manager },
      );

      return saved;
    });
  }
}
