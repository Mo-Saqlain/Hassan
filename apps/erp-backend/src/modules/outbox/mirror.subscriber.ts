import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { SyncQueueEntry, SyncQueueStatus } from './entities/sync-queue.entity';

/**
 * Tables the cloud mirror carries, in dependency order.
 *
 * Order matters for a bootstrap (`SyncService.mirrorAll`): the cloud applies
 * events in queue order, and a sale row cannot land before the customer and item
 * it points at. For ordinary operation the order is irrelevant — masters are
 * always created before the documents that reference them.
 *
 * Deliberately absent: users / access requests / login events (credentials never
 * leave the shop), audit and error logs (local diagnostics), the sync tables
 * themselves (recursion), POS session + cart rows (working state), and backups.
 */
export const MIRRORED_ENTITIES = [
  'Brand',
  'Category',
  'Store',
  'Account',
  'Supplier',
  'Customer',
  'Employee',
  'Item',
  'ItemSerial',
  'Purchase',
  'PurchaseItem',
  'Sale',
  'SaleItem',
  'SaleReturn',
  'SaleReturnItem',
  'PurchaseReturn',
  'PurchaseReturnItem',
  'Payment',
  'FundTransfer',
  'StockMovement',
  'StockTransfer',
  'StockTransferItem',
  'Delivery',
  'ServiceTicket',
  'JournalEntry',
  'JournalLine',
  'EmployeeTransaction',
] as const;

const MIRRORED = new Set<string>(MIRRORED_ENTITIES);

/**
 * Keeps the cloud copy in step by queueing the CURRENT STATE of every row that
 * changes, rather than replaying the business operation that changed it.
 *
 * WHY ROW STATE AND NOT EVENTS
 * ----------------------------
 * The old scheme enqueued five operation events (SALE_CREATED and friends) and
 * the receiver re-ran the service to rebuild them. That approach could never
 * make the mirror correct:
 *   • master data was never sent at all, so the cloud could not even apply a
 *     sale that referenced a locally-created item;
 *   • edits and reversals had no event type, so a corrected or voided voucher
 *     stayed live in the cloud and on the phone forever;
 *   • re-running services on the receiver re-derives cost, stock and journals
 *     from the CLOUD's state, which is not guaranteed to match the shop's.
 *
 * Upserting rows fixes all three at once, and it is idempotent by construction —
 * pushing the same row twice is the same as pushing it once, which matters for a
 * queue that retries. The mirror is read-only downstream (the phone reads it),
 * so it needs the data, not the derivation.
 *
 * A subscriber rather than per-service calls, for the same reason AuditSubscriber
 * is one: every write path is covered without 20 services having to remember,
 * including paths added later.
 *
 * Only active when CLOUD_SYNC_URL is set — a shop with no cloud queues nothing.
 */
@Injectable()
export class MirrorSubscriber
  implements EntitySubscriberInterface, OnModuleInit
{
  private readonly logger = new Logger(MirrorSubscriber.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<any>) {
    return this.queue(event, 'ENTITY_UPSERT');
  }

  afterUpdate(event: UpdateEvent<any>) {
    return this.queue(event as any, 'ENTITY_UPSERT');
  }

  afterRemove(event: RemoveEvent<any>) {
    return this.queue(event as any, 'ENTITY_DELETE');
  }

  private async queue(
    event: InsertEvent<any> | UpdateEvent<any> | RemoveEvent<any>,
    type: 'ENTITY_UPSERT' | 'ENTITY_DELETE',
  ) {
    if (!process.env.CLOUD_SYNC_URL) return;

    const name = event.metadata?.name;
    if (!name || !MIRRORED.has(name)) return;

    const row = (event as any).entity ?? (event as any).databaseEntity;
    if (!row?.id) return;

    try {
      // Same EntityManager as the operation that triggered it, so the queued
      // event lives or dies with that transaction — a rolled-back sale must not
      // leave the cloud an event for a sale that never existed.
      const repo = event.manager.getRepository(SyncQueueEntry);
      await repo.save(
        repo.create({
          id: randomUUID(),
          type,
          payload: JSON.stringify({
            entity: name,
            id: row.id,
            data: type === 'ENTITY_UPSERT' ? this.flatten(event, row) : undefined,
          }),
          status: 'PENDING' as SyncQueueStatus,
          attempts: 0,
        }),
      );
    } catch (err) {
      // Never break the business operation because the mirror could not be
      // queued. A missed row is recoverable — POST /sync/mirror-all re-queues
      // everything — whereas a failed sale is not.
      this.logger.warn(
        `Could not queue mirror event for ${name}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Column values only — no relation objects. Sending an eagerly-loaded
   * `customer` graph alongside `customerId` would be redundant, would balloon the
   * payload, and would let the receiver resurrect a stale copy of a row that has
   * its own mirror event.
   */
  private flatten(
    event: InsertEvent<any> | UpdateEvent<any> | RemoveEvent<any>,
    row: any,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const col of event.metadata.columns) {
      const value = col.getEntityValue(row);
      if (value !== undefined) out[col.propertyName] = value;
    }
    return out;
  }
}
