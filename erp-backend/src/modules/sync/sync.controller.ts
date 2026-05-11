import { Body, Controller, Get, Post } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncPushDto } from './dto/sync-push.dto';

@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  // Cloud receiver
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
