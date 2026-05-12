import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncentiveTarget } from './entities/incentive-target.entity';
import { IncentiveAward } from './entities/incentive-award.entity';
import { IncentivesService } from './incentives.service';
import { IncentivesController } from './incentives.controller';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';
import { Item } from '../items/entities/item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IncentiveTarget,
      IncentiveAward,
      Sale,
      SaleItem,
      SaleReturn,
      SaleReturnItem,
      Item,
    ]),
  ],
  controllers: [IncentivesController],
  providers: [IncentivesService],
  exports: [IncentivesService, TypeOrmModule],
})
export class IncentivesModule {}
