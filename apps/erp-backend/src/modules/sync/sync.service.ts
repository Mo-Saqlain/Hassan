import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { SyncEvent, SyncEventStatus } from './entities/sync-event.entity';
import { OutboxService } from '../outbox/outbox.service';
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
  ) {}

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
        case 'POS_SESSION_STARTED':
        case 'POS_SESSION_CLOSED':
          // Cloud side currently just acknowledges these (audit-only).
          // The local node is authoritative for session lifecycle.
          break;
        default:
          throw new Error(`Unknown sync event type: ${event.type}`);
      }
      await this.events.save({
        id: event.id,
        type: event.type,
        payload: JSON.stringify(event.payload),
        status: 'PROCESSED' as SyncEventStatus,
        resultId,
      });
      return { id: event.id, status: 'PROCESSED', resultId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync event ${event.id} failed: ${error}`);
      await this.events.save({
        id: event.id,
        type: event.type,
        payload: JSON.stringify(event.payload),
        status: 'FAILED' as SyncEventStatus,
        error,
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
