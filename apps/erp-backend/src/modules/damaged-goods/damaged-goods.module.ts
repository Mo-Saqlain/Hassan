import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DamagedGood } from './entities/damaged-good.entity';
import { DamagedGoodsService } from './damaged-goods.service';
import { DamagedGoodsController } from './damaged-goods.controller';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [TypeOrmModule.forFeature([DamagedGood]), StockModule],
  controllers: [DamagedGoodsController],
  providers: [DamagedGoodsService],
  exports: [DamagedGoodsService],
})
export class DamagedGoodsModule {}
