import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncPushDto } from './dto/sync-push.dto';
import { Public } from '../users/auth.decorators';
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

  @Get('status')
  async status() {
    return {
      cloudConfigured: !!process.env.CLOUD_SYNC_URL,
      cloudUrl: process.env.CLOUD_SYNC_URL ?? null,
      pending: await this.service.pendingCount(),
    };
  }

  /**
   * Manually trigger a sync push. Returns a summary the UI can show in a
   * toast ("Synced 3 events." / "Nothing to sync." / "Cloud push failed: …").
   * There is no background cron — syncing happens only when invoked.
   */
  @Post('flush')
  flush() {
    return this.service.pushPending();
  }
}
