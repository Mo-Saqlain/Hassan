import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeIncentiveRule } from './entities/employee-incentive-rule.entity';
import { EmployeeIncentivesService } from './employee-incentives.service';
import { EmployeeIncentivesController } from './employee-incentives.controller';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Item } from '../items/entities/item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeIncentiveRule,
      Sale,
      SaleItem,
      Item,
      SaleReturn,
      SaleReturnItem,
    ]),
  ],
  controllers: [EmployeeIncentivesController],
  providers: [EmployeeIncentivesService],
  exports: [EmployeeIncentivesService, TypeOrmModule],
})
export class EmployeeIncentivesModule {}
