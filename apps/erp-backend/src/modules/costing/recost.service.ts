import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';
import { PurchaseReturn } from '../returns/entities/purchase-return.entity';
import { PurchaseReturnItem } from '../returns/entities/purchase-return-item.entity';

/** One cost-affecting event in an item's history. */
type CostEvent =
  | { kind: 'PURCHASE_IN'; at: Date; seq: string; qty: number; unitPrice: number }
  | { kind: 'SALE_OUT'; at: Date; seq: string; qty: number; saleItemId: string }
  | { kind: 'SALE_RETURN_IN'; at: Date; seq: string; qty: number }
  | { kind: 'PURCHASE_RETURN_OUT'; at: Date; seq: string; qty: number };

export interface RecostResult {
  itemId: string;
  before: { avgCost: number; costedQty: number };
  after: { avgCost: number; costedQty: number };
  events: number;
  /** Sale lines whose COGS snapshot was rewritten (0 unless resnapshotSales). */
  resnapshotted: number;
  changed: boolean;
}

const round2 = (n: number) => Number(n.toFixed(2));

/**
 * Derives `Item.avgCost` / `Item.costedQty` by replaying an item's whole
 * cost-affecting history, instead of trusting the running values that the
 * forward paths mutate as documents post.
 *
 * WHY THIS EXISTS
 * ---------------
 * Weighted-average cost is path-dependent: `newAvg = (oldQty*oldAvg +
 * inQty*price) / (oldQty+inQty)`. Once a later purchase folds into the average,
 * an earlier one cannot be subtracted back out — which is precisely why editing
 * or reversing an old purchase used to be unsafe, and why reversal deliberately
 * restored `costedQty` but left `avgCost` alone (documented drift).
 *
 * Replaying from zero removes the problem: the cost basis becomes a pure
 * function of the surviving documents, so any voucher can be edited, reversed or
 * deleted and the cost is simply recomputed afterwards.
 *
 * EQUIVALENCE
 * -----------
 * The replay mirrors the forward arithmetic exactly, including its clamping, so
 * recomputing an untouched item is a no-op. Each event applies what its own
 * service applies:
 *   PURCHASE_IN          → weighted-average roll-up (PurchasesService.create)
 *   SALE_OUT             → costedQty − qty, floored at 0; avgCost unchanged
 *   SALE_RETURN_IN       → costedQty + qty        (RESTOCK returns only)
 *   PURCHASE_RETURN_OUT  → costedQty − qty, floored at 0 (STOCK returns only)
 * Reversed documents are skipped entirely — a reversal already unwound them, and
 * counting them here would apply the correction twice.
 *
 * ORDERING
 * --------
 * Events are ordered by `createdAt`, i.e. the order in which the roll-ups
 * actually happened — NOT by any user-facing document date. Using the document
 * date would make the replay disagree with the forward path for a back-dated
 * bill. Ties break by kind (purchases first, so a same-instant sale has cost
 * available) then by row id, so the result is deterministic.
 */
@Injectable()
export class RecostService {
  private readonly logger = new Logger(RecostService.name);

  /**
   * Repositories come off the DataSource rather than `@InjectRepository`: the
   * replay reads five tables it never writes, and requiring every module (and
   * every spec) that triggers a recost to register those five repositories
   * would spread this service's internals across the codebase.
   */
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Recompute one item. Pass `manager` to join a caller's transaction (the
   * usual case — recost runs in the same transaction as the edit that
   * triggered it, so a failed edit cannot leave a half-recosted item).
   *
   * `resnapshotSales` also rewrites `SaleItem.costAtSaleTime` for every sale in
   * the replay, so past COGS and margin figures reflect the corrected cost
   * basis. Leave it off to correct the item's forward-looking cost only and
   * keep historical reports reproducible.
   */
  async recomputeItem(
    itemId: string,
    opts: { manager?: EntityManager; resnapshotSales?: boolean } = {},
  ): Promise<RecostResult> {
    const run = async (manager: EntityManager) => {
      const itemRepo = manager.getRepository(Item);
      const item = await itemRepo.findOne({ where: { id: itemId } });
      if (!item) throw new NotFoundException(`Item ${itemId} not found`);

      const before = {
        avgCost: Number(item.avgCost) || 0,
        costedQty: Number(item.costedQty) || 0,
      };

      const timeline = await this.buildTimeline(itemId, manager);

      // Start from the opening cost basis, not from zero: stock carried in from
      // previous software (or an opening stocktake) has no purchase document to
      // replay, and replaying from zero would silently erase it.
      let qty = Number(item.openingCostedQty) || 0;
      let avg = Number(item.openingAvgCost) || 0;
      let lastPurchasePrice: number | null = null;
      const snapshots: { saleItemId: string; cost: number }[] = [];

      for (const ev of timeline) {
        switch (ev.kind) {
          case 'PURCHASE_IN': {
            const newQty = qty + ev.qty;
            avg =
              newQty > 0
                ? round2((qty * avg + ev.qty * ev.unitPrice) / newQty)
                : 0;
            qty = newQty;
            lastPurchasePrice = ev.unitPrice;
            break;
          }
          case 'SALE_OUT': {
            // The forward path snapshots the average prevailing at sale time.
            // When it was still 0 it fell back to the THEN-current
            // purchasePrice, a value we can't recover (purchasePrice is
            // overwritten by each purchase), so leave those snapshots alone
            // rather than rewriting them with today's number.
            if (opts.resnapshotSales && avg > 0) {
              snapshots.push({ saleItemId: ev.saleItemId, cost: avg });
            }
            qty = Math.max(0, qty - ev.qty);
            break;
          }
          case 'SALE_RETURN_IN':
            qty = qty + ev.qty;
            break;
          case 'PURCHASE_RETURN_OUT':
            qty = Math.max(0, qty - ev.qty);
            break;
        }
      }

      const changed = before.avgCost !== avg || before.costedQty !== qty;

      item.avgCost = avg;
      item.costedQty = qty;
      // purchasePrice is the "latest cost" reference the UI defaults from; the
      // forward path overwrites it on every purchase, so keep it consistent.
      // Untouched when the item has no surviving purchase to derive it from.
      if (lastPurchasePrice != null) item.purchasePrice = lastPurchasePrice;
      await itemRepo.save(item);

      for (const s of snapshots) {
        await manager
          .getRepository(SaleItem)
          .update({ id: s.saleItemId }, { costAtSaleTime: s.cost });
      }

      return {
        itemId,
        before,
        after: { avgCost: avg, costedQty: qty },
        events: timeline.length,
        resnapshotted: snapshots.length,
        changed,
      };
    };

    return opts.manager
      ? run(opts.manager)
      : this.dataSource.transaction((m) => run(m));
  }

  /** Recompute several items, de-duplicated. Order is not significant — each
   *  item's cost basis depends only on its own documents. */
  async recomputeItems(
    itemIds: string[],
    opts: { manager?: EntityManager; resnapshotSales?: boolean } = {},
  ): Promise<RecostResult[]> {
    const unique = [...new Set(itemIds.filter(Boolean))];
    const results: RecostResult[] = [];
    for (const id of unique) {
      results.push(await this.recomputeItem(id, opts));
    }
    return results;
  }

  /**
   * Recompute the whole catalogue. Intended as an explicit maintenance action
   * (and as the one-off backfill for installs whose running averages already
   * drifted before recosting existed) — not something to run per request.
   */
  async recomputeAll(
    opts: { resnapshotSales?: boolean } = {},
  ): Promise<{
    items: number;
    changed: number;
    resnapshotted: number;
    details: RecostResult[];
  }> {
    const all = await this.dataSource
      .getRepository(Item)
      .find({ select: { id: true } });
    const details: RecostResult[] = [];
    for (const { id } of all) {
      details.push(await this.recomputeItem(id, opts));
    }
    const changed = details.filter((d) => d.changed).length;
    const resnapshotted = details.reduce((s, d) => s + d.resnapshotted, 0);
    this.logger.log(
      `Recost: ${all.length} item(s) replayed, ${changed} corrected, ${resnapshotted} COGS snapshot(s) rewritten.`,
    );
    return { items: all.length, changed, resnapshotted, details };
  }

  /**
   * Every surviving cost-affecting document line for the item, in the order the
   * roll-ups happened. Reversed parents are excluded, as are dispositions that
   * never touched cost (CLAIMED_TO_COMPANY / WARRANTY_CREDIT book no stock and
   * no costedQty change, so they contribute nothing to replay).
   */
  private async buildTimeline(
    itemId: string,
    manager: EntityManager,
  ): Promise<CostEvent[]> {
    const purchaseLines = await manager
      .getRepository(PurchaseItem)
      .createQueryBuilder('pl')
      .innerJoin(Purchase, 'p', 'p.id = pl.purchase_id')
      .where('pl.item_id = :itemId', { itemId })
      .andWhere('p.reversed_at IS NULL')
      .select(['pl.id AS id', 'pl.quantity AS quantity', 'pl.unit_price AS unit_price'])
      .addSelect('p.created_at', 'created_at')
      .getRawMany();

    const saleLines = await manager
      .getRepository(SaleItem)
      .createQueryBuilder('sl')
      .innerJoin(Sale, 's', 's.id = sl.sale_id')
      .where('sl.item_id = :itemId', { itemId })
      .andWhere('s.reversed_at IS NULL')
      .select(['sl.id AS id', 'sl.quantity AS quantity'])
      .addSelect('s.created_at', 'created_at')
      .getRawMany();

    const saleReturnLines = await manager
      .getRepository(SaleReturnItem)
      .createQueryBuilder('rl')
      .innerJoin(SaleReturn, 'r', 'r.id = rl.sale_return_id')
      .where('rl.item_id = :itemId', { itemId })
      .andWhere('r.reversed_at IS NULL')
      .andWhere("r.disposition = 'RESTOCK'")
      .select(['rl.id AS id', 'rl.quantity AS quantity'])
      .addSelect('r.created_at', 'created_at')
      .getRawMany();

    const purchaseReturnLines = await manager
      .getRepository(PurchaseReturnItem)
      .createQueryBuilder('rl')
      .innerJoin(PurchaseReturn, 'r', 'r.id = rl.purchase_return_id')
      .where('rl.item_id = :itemId', { itemId })
      .andWhere('r.reversed_at IS NULL')
      .andWhere("r.disposition = 'STOCK'")
      .select(['rl.id AS id', 'rl.quantity AS quantity'])
      .addSelect('r.created_at', 'created_at')
      .getRawMany();

    const events: CostEvent[] = [
      ...purchaseLines.map((r: any) => ({
        kind: 'PURCHASE_IN' as const,
        at: new Date(r.created_at),
        seq: String(r.id),
        qty: Number(r.quantity),
        unitPrice: Number(r.unit_price),
      })),
      ...saleLines.map((r: any) => ({
        kind: 'SALE_OUT' as const,
        at: new Date(r.created_at),
        seq: String(r.id),
        qty: Number(r.quantity),
        saleItemId: String(r.id),
      })),
      ...saleReturnLines.map((r: any) => ({
        kind: 'SALE_RETURN_IN' as const,
        at: new Date(r.created_at),
        seq: String(r.id),
        qty: Number(r.quantity),
      })),
      ...purchaseReturnLines.map((r: any) => ({
        kind: 'PURCHASE_RETURN_OUT' as const,
        at: new Date(r.created_at),
        seq: String(r.id),
        qty: Number(r.quantity),
      })),
    ];

    // Purchases before anything else at the same instant so a sale posted in
    // the same tick sees the cost it was priced against.
    const rank: Record<CostEvent['kind'], number> = {
      PURCHASE_IN: 0,
      SALE_RETURN_IN: 1,
      PURCHASE_RETURN_OUT: 2,
      SALE_OUT: 3,
    };
    return events.sort((a, b) => {
      const t = a.at.getTime() - b.at.getTime();
      if (t !== 0) return t;
      if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
      return a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0;
    });
  }

  /** Items with at least one surviving purchase — used by the maintenance
   *  endpoint to report what a full recompute would touch. */
  async itemsWithCostHistory(): Promise<number> {
    return this.dataSource
      .getRepository(PurchaseItem)
      .createQueryBuilder('pl')
      .innerJoin(Purchase, 'p', 'p.id = pl.purchase_id')
      .where('p.reversed_at IS NULL')
      .select('COUNT(DISTINCT pl.item_id)', 'c')
      .getRawOne()
      .then((r: any) => Number(r?.c ?? 0));
  }

}
