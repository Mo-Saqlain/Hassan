import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { BrandsModule } from './modules/brands/brands.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ItemsModule } from './modules/items/items.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { StoresModule } from './modules/stores/stores.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { StockModule } from './modules/stock/stock.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { SyncModule } from './modules/sync/sync.module';
import { PosModule } from './modules/pos/pos.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CashRegisterModule } from './modules/cash-register/cash-register.module';
import { IncentivesModule } from './modules/incentives/incentives.module';
import { FundTransfersModule } from './modules/fund-transfers/fund-transfers.module';
import { BackupModule } from './modules/backup/backup.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { EmployeeTransactionsModule } from './modules/employee-transactions/employee-transactions.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { EmployeeIncentivesModule } from './modules/employee-incentives/employee-incentives.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { StockTransfersModule } from './modules/stock-transfers/stock-transfers.module';
import { DamagedGoodsModule } from './modules/damaged-goods/damaged-goods.module';

function buildDbOptions(): TypeOrmModuleOptions {
  const useSqlite = !process.env.DATABASE_URL;
  if (useSqlite) {
    return {
      type: 'better-sqlite3',
      database: process.env.SQLITE_PATH ?? 'erp.sqlite',
      autoLoadEntities: true,
      synchronize: true,
    };
  }
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    autoLoadEntities: true,
    synchronize: process.env.DB_SYNC === 'true',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(buildDbOptions()),
    BrandsModule,
    CategoriesModule,
    ItemsModule,
    CustomersModule,
    SuppliersModule,
    StoresModule,
    AccountsModule,
    StockModule,
    SalesModule,
    PurchasesModule,
    ReturnsModule,
    PaymentsModule,
    OutboxModule,
    SyncModule,
    PosModule,
    ReportsModule,
    FundTransfersModule,
    CashRegisterModule,
    IncentivesModule,
    EmployeesModule,
    EmployeeTransactionsModule,
    AttendanceModule,
    EmployeeIncentivesModule,
    PurchaseOrdersModule,
    StockTransfersModule,
    DamagedGoodsModule,
    BackupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
