import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SalaryAccrualService } from './salary-accrual.service';

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly service: EmployeesService,
    private readonly salaryAccrual: SalaryAccrualService,
  ) {}

  @Post() create(@Body() dto: CreateEmployeeDto) { return this.service.create(dto); }
  @Get() findAll() { return this.service.findAll(); }

  /**
   * Run the salary-accrual scheduler immediately. POST /employees/accrue-salaries
   * fires the cron logic for every active employee; POST /employees/:id/accrue-salary
   * targets a single employee. Both are idempotent — re-running in the same
   * calendar month is a no-op.
   */
  @Post('accrue-salaries')
  accrueAll() {
    return this.salaryAccrual.accrueDueNow();
  }

  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/accrue-salary')
  accrueOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salaryAccrual.accrueDueNow(id);
  }
}
