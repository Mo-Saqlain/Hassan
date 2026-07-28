import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncPushDto } from './dto/sync-push.dto';
import { Public, SuperuserOnly } from '../users/auth.decorators';
import { SyncSignatureGuard } from './sync-signature.guard';

@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  // Cloud receiver — webhook-style endpoint from a local node. Bypasses the
  // user-session AuthGuard (no logged-in user on a server-to-server push) and
  // authenticates instead via an HMAC-SHA256 signature over the request body
  // using a shared SHOP_SYNC_SECRET. See SyncSignatureGuard.
  @Public()
  @UseGuards(SyncSignatureGuard)
  @Post('push')
  push(@Body() dto: SyncPushDto) {
    return this.service.push(dto.events);
  }

  @Get('events')
  events() {
    return this.service.listEvents();
  }

  // Local outbox introspection
  @Get('queue')
  queue() {
    return this.service.listQueue();
  }

  /**
   * Live database connection health — used by the System → Connection page to
   * confirm the app is talking to Supabase (or the local SQLite file).
   */
  @Get('connection')
  connection() {
    return this.service.connectionInfo();
  }

  @Get('status')
  async status() {
    return {
      cloudConfigured: !!process.env.CLOUD_SYNC_URL,
      cloudUrl: process.env.CLOUD_SYNC_URL ?? null,
      pending: await this.service.pendingCount(),
      failed: await this.service.failedCount(),
    };
  }

  /** Poison-pill review list — every FAILED row + its last error message. */
  @Get('failed')
  failed() {
    return this.service.listFailed();
  }

  /** Reset a single FAILED row to PENDING so the next flush retries it. */
  @Post('failed/:id/retry')
  retryFailed(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.retryFailed(id);
  }

  /**
   * Manually trigger a sync push. Returns a summary the UI can show in a
   * toast ("Synced 3 events." / "Nothing to sync." / "Cloud push failed: …").
   * There is no background cron — syncing happens only when invoked.
   */
  /**
   * Queue the entire mirrored dataset for push — how a fresh cloud gets filled.
   * Superuser-only: on a shop with history it queues one event per row, so it is
   * a deliberate operation, not something to trigger by accident. Idempotent
   * (every event is an upsert), so re-running only costs bandwidth.
   */
  @SuperuserOnly()
  @Post('mirror-all')
  mirrorAll() {
    return this.service.mirrorAll();
  }

  @Post('flush')
  flush() {
    return this.service.pushPending();
  }
}
