import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { PurchaseReturn } from '../returns/entities/purchase-return.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Account } from '../accounts/entities/account.entity';
import { Item } from '../items/entities/item.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { IncentivesModule } from '../incentives/incentives.module';
import { FundTransfersModule } from '../fund-transfers/fund-transfers.module';
import { EmployeeIncentivesModule } from '../employee-incentives/employee-incentives.module';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeTransaction } from '../employee-transactions/entities/employee-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      Supplier,
      Sale,
      SaleItem,
      Purchase,
      PurchaseItem,
      SaleReturn,
      PurchaseReturn,
      Payment,
      Account,
      Item,
      StockMovement,
      Employee,
      EmployeeTransaction,
    ]),
    IncentivesModule,
    FundTransfersModule,
    EmployeeIncentivesModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
