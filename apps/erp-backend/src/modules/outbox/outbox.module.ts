import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncQueueEntry } from './entities/sync-queue.entity';
import { OutboxService } from './outbox.service';
import { MirrorSubscriber } from './mirror.subscriber';

@Module({
  imports: [TypeOrmModule.forFeature([SyncQueueEntry])],
  providers: [OutboxService, MirrorSubscriber],
  exports: [OutboxService, TypeOrmModule],
})
export class OutboxModule {}
