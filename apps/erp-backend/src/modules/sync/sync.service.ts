import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import axios from 'axios';
import { SyncEvent, SyncEventStatus } from './entities/sync-event.entity';
import { OutboxService } from '../outbox/outbox.service';
import { MIRRORED_ENTITIES } from '../outbox/mirror.subscriber';
import { SalesService } from '../sales/sales.service';
import { PurchasesService } from '../purchases/purchases.service';
import { SyncEventDto } from './dto/sync-push.dto';
import {
  signSyncRequest,
  SYNC_SHOP_ID_HEADER,
  SYNC_SIGNATURE_HEADER,
  SYNC_TIMESTAMP_HEADER,
} from './hmac.util';

export interface SyncEventResult {
  id: string;
  status: SyncEventStatus;
  resultId?: string;
  error?: string;
}

/** Summary returned by an on-demand sync run, for UI display. */
export interface SyncRunSummary {
  ok: boolean;
  cloudConfigured: boolean;
  attempted: number;
  succeeded: number;
  failed: number;
  message: string;
  error?: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private isPushing = false;

  constructor(
    @InjectRepository(SyncEvent)
    private readonly events: Repository<SyncEvent>,
    private readonly outbox: OutboxService,
    private readonly salesService: SalesService,
    private readonly purchasesService: PurchasesService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Apply a mirrored row. Upsert by primary key, so re-pushing is harmless and a
   * corrected document simply overwrites the version the cloud held.
   *
   * The entity name is checked against the mirror whitelist before use: the
   * payload arrives over HTTP, and resolving an arbitrary string to a repository
   * would let a caller write any table in the database (users included) through
   * an endpoint whose HMAC only proves the shop sent it, not what it may touch.
   */
  private async applyUpsert(payload: {
    entity?: string;
    id?: string;
    data?: Record<string, unknown>;
  }): Promise<string> {
    const { entity, id, data } = payload ?? {};
    if (!entity || !id || !data) {
      throw new Error('ENTITY_UPSERT payload needs entity, id and data');
    }
    if (!MIRRORED_ENTITIES.includes(entity as any)) {
      throw new Error(`Entity ${entity} is not mirrored`);
    }
    const repo = this.dataSource.getRepository(entity);
    // save() rather than upsert(): upsert needs a conflict target per dialect,
    // and save on an entity carrying its own id updates when the row exists.
    await repo.save(repo.create({ ...data, id } as any));
    return id;
  }

  private async applyDelete(payload: {
    entity?: string;
    id?: string;
  }): Promise<string> {
    const { entity, id } = payload ?? {};
    if (!entity || !id) {
      throw new Error('ENTITY_DELETE payload needs entity and id');
    }
    if (!MIRRORED_ENTITIES.includes(entity as any)) {
      throw new Error(`Entity ${entity} is not mirrored`);
    }
    await this.dataSource.getRepository(entity).delete(id);
    return id;
  }

  /**
   * Queue the whole mirrored dataset for push — the way a fresh cloud gets
   * populated.
   *
   * Sync alone could never build the cloud copy from nothing: it only ever
   * carried five document events, so master data (and everything entered before
   * the cloud was configured) was missing, which is why a brand-new Supabase
   * project stayed empty apart from its schema. This walks the mirrored tables in
   * dependency order — masters before the documents that reference them — and
   * enqueues each row's current state.
   *
   * Safe to re-run: every event is an idempotent upsert.
   */
  async mirrorAll(): Promise<{ queued: number; byEntity: Record<string, number> }> {
    const byEntity: Record<string, number> = {};
    let queued = 0;

    for (const name of MIRRORED_ENTITIES) {
      if (!this.dataSource.hasMetadata(name)) continue;
      const rows = await this.dataSource.getRepository(name).find();
      for (const row of rows) {
        const meta = this.dataSource.getMetadata(name);
        const data: Record<string, unknown> = {};
        for (const col of meta.columns) {
          const value = col.getEntityValue(row as any);
          if (value !== undefined) data[col.propertyName] = value;
        }
        await this.outbox.enqueue('ENTITY_UPSERT', {
          entity: name,
          id: (row as any).id,
          data,
        });
        queued += 1;
      }
      if (rows.length > 0) byEntity[name] = rows.length;
    }

    this.logger.log(`Mirror bootstrap queued ${queued} row(s) for push.`);
    return { queued, byEntity };
  }

  // ---------- Connection check ----------
  /**
   * Live health check on the primary database connection. When `DATABASE_URL`
   * points at Supabase this confirms the cloud Postgres is reachable; on a
   * desktop install it reports the local SQLite file. Runs a trivial query and
   * times it. Never leaks credentials — only driver / host / database / port.
   */
  async connectionInfo() {
    const conn = this.events.manager.connection;
    const opts = conn.options as {
      type: string;
      host?: string;
      port?: number;
      database?: unknown;
    };
    const isPostgres = opts.type === 'postgres';
    const target = isPostgres
      ? opts.host?.includes('supabase')
        ? 'Supabase (Postgres)'
        : 'PostgreSQL'
      : 'Local SQLite';
    const started = Date.now();
    try {
      await conn.query('SELECT 1');
      return {
        connected: true,
        target,
        driver: opts.type,
        host: isPostgres ? opts.host ?? null : null,
        port: isPostgres ? opts.port ?? null : null,
        database: isPostgres
          ? typeof opts.database === 'string'
            ? opts.database
            : null
          : String(opts.database ?? ''),
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      return {
        connected: false,
        target,
        driver: opts.type,
        host: isPostgres ? opts.host ?? null : null,
        port: isPostgres ? opts.port ?? null : null,
        latencyMs: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ---------- Inbound (cloud receiver) ----------
  async push(events: SyncEventDto[]): Promise<SyncEventResult[]> {
    const results: SyncEventResult[] = [];
    for (const event of events) {
      results.push(await this.handleEvent(event));
    }
    return results;
  }

  private async handleEvent(event: SyncEventDto): Promise<SyncEventResult> {
    const existing = await this.events.findOne({ where: { id: event.id } });
    if (existing) {
      return {
        id: event.id,
        status: 'DUPLICATE',
        resultId: existing.resultId,
      };
    }
    try {
      let resultId: string | undefined;
      switch (event.type) {
        case 'SALE_CREATED':
        case 'POS_SALE_CREATED': {
          // POS sales are normal sales on the cloud — they were already
          // captured locally with stock movements and just need to land
          // in the cloud DB. The cloud has no POS session, so we strip
          // session-only metadata from the payload before persisting.
          const { sessionId, ...salePayload } = event.payload as any;
          const sale = await this.salesService.create(salePayload, {
            skipOutbox: true,
          });
          resultId = sale.id;
          break;
        }
        case 'SALE_VOUCHER_CREATED': {
          // Bill-book voucher sale: replays through createFromVoucher, which
          // rebuilds the Sale + its receipt splits atomically. It re-enqueues
          // only when CLOUD_SYNC_URL is set, which the terminal cloud receiver
          // doesn't have — so there's no onward push loop here.
          const { sale } = await this.salesService.createFromVoucher(
            event.payload as any,
          );
          resultId = sale.id;
          break;
        }
        case 'PURCHASE_CREATED': {
          const p = await this.purchasesService.create(event.payload as any, {
            skipOutbox: true,
          });
          resultId = p.id;
          break;
        }
        case 'ENTITY_UPSERT': {
          // Row-state mirror: write the row as the shop currently has it. This
          // is what carries master data, edits and reversals — none of which the
          // operation-replay events above can express. The shop is authoritative;
          // the cloud does not re-derive anything.
          resultId = await this.applyUpsert(event.payload as any);
          break;
        }
        case 'ENTITY_DELETE': {
          resultId = await this.applyDelete(event.payload as any);
          break;
        }
        case 'SALE_UPDATED':
        case 'PURCHASE_UPDATED':
          // The corrected document arrives as its own ENTITY_UPSERT events (the
          // header and every line), which is what actually updates the cloud.
          // These are kept as an audit breadcrumb of WHY it changed — the edit
          // reason travels on them — so acknowledging is the whole job.
          break;
        case 'POS_SESSION_STARTED':
        case 'POS_SESSION_CLOSED':
          // Cloud side currently just acknowledges these (audit-only).
          // The local node is authoritative for session lifecycle.
          break;
        default:
          throw new Error(`Unknown sync event type: ${event.type}`);
      }
      const payloadObj = event.payload as any;
      const showroomId =
        payloadObj?.showroomId ||
        payloadObj?.showroom_id ||
        payloadObj?.data?.showroomId ||
        payloadObj?.data?.showroom_id;

      await this.events.save({
        id: event.id,
        type: event.type,
        payload: JSON.stringify(event.payload),
        status: 'PROCESSED' as SyncEventStatus,
        resultId,
        showroomId,
      });
      return { id: event.id, status: 'PROCESSED', resultId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync event ${event.id} failed: ${error}`);
      const payloadObj = event.payload as any;
      const showroomId =
        payloadObj?.showroomId ||
        payloadObj?.showroom_id ||
        payloadObj?.data?.showroomId ||
        payloadObj?.data?.showroom_id;

      await this.events.save({
        id: event.id,
        type: event.type,
        payload: JSON.stringify(event.payload),
        status: 'FAILED' as SyncEventStatus,
        error,
        showroomId,
      });
      return { id: event.id, status: 'FAILED', error };
    }
  }

  listEvents() {
    return this.events.find({ order: { receivedAt: 'DESC' }, take: 200 });
  }

  // ---------- Outbound (local outbox worker) ----------
  listQueue() {
    return this.outbox.list();
  }

  pendingCount() {
    return this.outbox.countPending();
  }

  failedCount() {
    return this.outbox.countFailed();
  }

  listFailed() {
    return this.outbox.failed();
  }

  retryFailed(id: string) {
    return this.outbox.retry(id);
  }

  /**
   * Pushes PENDING outbox entries to the configured cloud sync URL.
   * Triggered manually from the UI ("Sync now" button) — there is no
   * background cron. Returns a summary so the UI can show what happened.
   */
  async pushPending(): Promise<SyncRunSummary> {
    const cloudUrl = process.env.CLOUD_SYNC_URL;
    if (!cloudUrl) {
      return {
        ok: false,
        cloudConfigured: false,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        message:
          'Cloud sync URL not configured. Set CLOUD_SYNC_URL or cloudSyncUrl in config.json.',
      };
    }
    const shopId = process.env.SHOP_ID;
    const shopSecret = process.env.SHOP_SYNC_SECRET;
    if (!shopId || !shopSecret) {
      return {
        ok: false,
        cloudConfigured: true,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        message:
          'SHOP_ID / SHOP_SYNC_SECRET not configured — refusing to push unsigned.',
      };
    }
    if (this.isPushing) {
      return {
        ok: false,
        cloudConfigured: true,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        message: 'A sync is already in progress — try again in a moment.',
      };
    }
    this.isPushing = true;
    try {
      // Pull every PENDING row, no chunk cap. Poison-pill isolation below
      // flips per-event status independently so a stuck row can't stall
      // the queue — the next healthy event is always tried.
      const pending = await this.outbox.pending();
      if (pending.length === 0) {
        return {
          ok: true,
          cloudConfigured: true,
          attempted: 0,
          succeeded: 0,
          failed: 0,
          message: 'Nothing to sync — outbox is already empty.',
        };
      }
      const body = {
        events: pending.map((e) => ({
          id: e.id,
          type: e.type,
          payload: JSON.parse(e.payload),
        })),
      };
      // Sign the canonical JSON.stringify of the body. The receiver verifies
      // by re-stringifying its parsed body — works as long as both sides are
      // Node.js (V8 preserves key insertion order through JSON.parse).
      const bodyJson = JSON.stringify(body);
      const timestamp = new Date().toISOString();
      const signature = signSyncRequest(shopSecret, timestamp, bodyJson);
      try {
        const res = await axios.post<SyncEventResult[]>(cloudUrl, bodyJson, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            [SYNC_SHOP_ID_HEADER]: shopId,
            [SYNC_TIMESTAMP_HEADER]: timestamp,
            [SYNC_SIGNATURE_HEADER]: signature,
          },
          transformRequest: [(d) => d],
        });
        const byId = new Map(res.data.map((r) => [r.id, r]));
        let succeeded = 0;
        let failed = 0;
        const now = new Date();
        // Per-event try/catch: a poison-pill record that the cloud rejects
        // (schema mismatch, FK violation, corrupted payload) must NOT stop
        // us from processing the next healthy event. We tag it FAILED with
        // the server's error string and move on.
        for (const entry of pending) {
          const result = byId.get(entry.id);
          if (!result) continue;
          entry.attempts += 1;
          entry.lastAttemptAt = now;
          try {
            if (
              result.status === 'PROCESSED' ||
              result.status === 'DUPLICATE'
            ) {
              entry.status = 'SYNCED';
              entry.error = undefined;
              succeeded += 1;
            } else {
              entry.status = 'FAILED';
              entry.error = result.error ?? 'Unknown error';
              failed += 1;
            }
            await this.outbox.save(entry);
          } catch (perRowErr) {
            // Even the per-row save can hit a transient lock or constraint;
            // log but never throw out of the loop.
            const msg =
              perRowErr instanceof Error
                ? perRowErr.message
                : String(perRowErr);
            this.logger.warn(
              `Failed to persist outbox status for ${entry.id}: ${msg}`,
            );
          }
        }
        this.logger.log(
          `Sync pushed ${pending.length} events (succeeded=${succeeded}, failed=${failed})`,
        );
        return {
          ok: failed === 0,
          cloudConfigured: true,
          attempted: pending.length,
          succeeded,
          failed,
          message:
            failed === 0
              ? `Synced ${succeeded} event${succeeded === 1 ? '' : 's'}.`
              : `Synced ${succeeded} event${succeeded === 1 ? '' : 's'}; ${failed} failed.`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Cloud push failed: ${msg}`);
        for (const entry of pending) {
          entry.attempts += 1;
          entry.error = msg;
          await this.outbox.save(entry);
        }
        return {
          ok: false,
          cloudConfigured: true,
          attempted: pending.length,
          succeeded: 0,
          failed: pending.length,
          error: msg,
          message: `Cloud push failed: ${msg}`,
        };
      }
    } finally {
      this.isPushing = false;
    }
  }
}
