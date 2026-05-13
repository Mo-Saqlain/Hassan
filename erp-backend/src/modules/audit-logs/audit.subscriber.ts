import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { AuditLogsService } from './audit-logs.service';

/**
 * Set of entity class names that we do NOT audit. These are internal
 * book-keeping tables (the audit log itself, the outbox queue used by
 * the sync worker, and the error log) — auditing them would either
 * cause an infinite recursion or flood the audit table with noise that
 * isn't useful to the user.
 */
const SKIP = new Set(['AuditLog', 'ErrorLog', 'OutboxEvent']);

/**
 * Subset of entity fields included verbatim in the `summary` string and
 * the `changes` blob. We don't want to dump giant relation graphs into
 * every audit row — only the few human-meaningful columns.
 */
const SUMMARY_KEYS = new Set([
  'id',
  'code',
  'sku',
  'name',
  'voucherNo',
  'invoiceNo',
  'billNo',
  'transferNo',
  'poNo',
  'returnNo',
  'amount',
  'totalAmount',
  'netAmount',
  'quantity',
  'status',
  'type',
  'direction',
  'isActive',
  'paymentMethod',
  'date',
  'transactionDate',
  'entryDate',
]);

@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface<any>, OnModuleInit {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogsService,
  ) {}

  /** Register self with the active data source on app boot. */
  onModuleInit() {
    if (!this.dataSource.subscribers.includes(this)) {
      this.dataSource.subscribers.push(this);
    }
  }

  afterInsert(event: InsertEvent<any>) {
    this.record('CREATE', event.entity, undefined, event);
  }

  afterUpdate(event: UpdateEvent<any>) {
    this.record('UPDATE', event.entity, event.databaseEntity, event);
  }

  afterRemove(event: RemoveEvent<any>) {
    this.record('DELETE', event.databaseEntity ?? event.entity, undefined, event);
  }

  // ─── helpers ────────────────────────────────────────────────────────

  private record(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    after: any,
    before: any,
    event: { metadata?: { targetName?: string } },
  ) {
    if (!after && !before) return;
    const entityType =
      event?.metadata?.targetName ??
      after?.constructor?.name ??
      before?.constructor?.name ??
      'Unknown';
    if (SKIP.has(entityType)) return;

    const summary = describe(action, entityType, after ?? before);
    const changes =
      action === 'UPDATE'
        ? diff(before, after)
        : pickSummary(after ?? before);

    // best-effort fire-and-forget — never let audit failures break the
    // originating insert/update/delete
    this.audit.record({
      entityType,
      entityId: (after ?? before)?.id,
      action,
      summary,
      changes,
      source: detectSource(),
    });
  }
}

function describe(action: string, entityType: string, entity: any): string {
  if (!entity) return `${action} ${entityType}`;
  const name =
    entity.name ??
    entity.invoiceNo ??
    entity.billNo ??
    entity.voucherNo ??
    entity.transferNo ??
    entity.poNo ??
    entity.returnNo ??
    entity.code ??
    entity.sku ??
    entity.id;
  return `${entityType} ${name ?? ''}`.trim() + ` ${action.toLowerCase()}d`;
}

function pickSummary(entity: any): Record<string, unknown> | undefined {
  if (!entity || typeof entity !== 'object') return undefined;
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(entity)) {
    if (SUMMARY_KEYS.has(key)) picked[key] = entity[key];
  }
  return Object.keys(picked).length ? picked : undefined;
}

function diff(before: any, after: any): Record<string, unknown> | undefined {
  if (!before || !after) return pickSummary(after ?? before);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (!SUMMARY_KEYS.has(key)) continue;
    if (before[key] !== after[key]) {
      out[key] = { from: before[key], to: after[key] };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Cheap heuristic: in NestJS we set request-scoped context with
 * AsyncLocalStorage in some apps; we don't here, so just try to
 * detect cron vs http via process state. Falls back to 'unknown'.
 */
function detectSource(): string {
  // No request context available — caller can override via the service
  // method when invoking from a known path (filter or interceptor).
  return 'system';
}
