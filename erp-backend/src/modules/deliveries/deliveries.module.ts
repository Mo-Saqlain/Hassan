import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delivery } from './entities/delivery.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Item } from '../items/entities/item.entity';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { SequenceModule } from '../sequences/sequence.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, Sale, Item]),
    SequenceModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
