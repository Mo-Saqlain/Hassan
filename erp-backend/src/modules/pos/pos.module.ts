import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosSession } from './entities/pos-session.entity';
import { PosCartItem } from './entities/pos-cart-item.entity';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';
import { ItemsModule } from '../items/items.module';
import { SalesModule } from '../sales/sales.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PosSession, PosCartItem]),
    ItemsModule,
    SalesModule,
    OutboxModule,
  ],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
