import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncEvent } from './entities/sync-event.entity';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { SyncSignatureGuard } from './sync-signature.guard';
import { OutboxModule } from '../outbox/outbox.module';
import { SalesModule } from '../sales/sales.module';
import { PurchasesModule } from '../purchases/purchases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SyncEvent]),
    ScheduleModule.forRoot(),
    OutboxModule,
    SalesModule,
    PurchasesModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncSignatureGuard],
  exports: [SyncService],
})
export class SyncModule {}
