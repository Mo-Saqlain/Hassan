import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeTransaction } from './entities/employee-transaction.entity';
import { EmployeeTransactionsService } from './employee-transactions.service';
import { EmployeeTransactionsController } from './employee-transactions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeTransaction])],
  controllers: [EmployeeTransactionsController],
  providers: [EmployeeTransactionsService],
  exports: [EmployeeTransactionsService, TypeOrmModule],
})
export class EmployeeTransactionsModule {}
