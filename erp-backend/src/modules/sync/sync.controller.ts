import { Body, Controller, Get, Post } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncPushDto } from './dto/sync-push.dto';
import { Public } from '../users/auth.decorators';

@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  // Cloud receiver — webhook-style endpoint from a local node, so it
  // bypasses the user-session auth guard. Authenticity in a future
  // hardening pass should come from a shared cloud-sync secret.
  @Public()
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

  @Post('flush')
  async flush() {
    await this.service.pushPending();
    return { ok: true };
  }
}
