import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { SalaryAccrualService } from './salary-accrual.service';
import { EmployeeTransactionsModule } from '../employee-transactions/employee-transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee]),
    EmployeeTransactionsModule,
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService, SalaryAccrualService],
  exports: [EmployeesService, SalaryAccrualService, TypeOrmModule],
})
export class EmployeesModule {}
