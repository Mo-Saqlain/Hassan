import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { SyncEvent, SyncEventStatus } from './entities/sync-event.entity';
import { OutboxService } from '../outbox/outbox.service';
import { SalesService } from '../sales/sales.service';
import { PurchasesService } from '../purchases/purchases.service';
import { SyncEventDto } from './dto/sync-push.dto';

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
      const pending = await this.outbox.pending(50);
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
      try {
        const res = await axios.post<SyncEventResult[]>(cloudUrl, body, {
          timeout: 10000,
        });
        const byId = new Map(res.data.map((r) => [r.id, r]));
        let succeeded = 0;
        let failed = 0;
        for (const entry of pending) {
          const result = byId.get(entry.id);
          if (!result) continue;
          entry.attempts += 1;
          if (result.status === 'PROCESSED' || result.status === 'DUPLICATE') {
            entry.status = 'SYNCED';
            entry.error = undefined;
            succeeded += 1;
          } else {
            entry.status = 'FAILED';
            entry.error = result.error ?? 'Unknown error';
            failed += 1;
          }
          await this.outbox.save(entry);
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
