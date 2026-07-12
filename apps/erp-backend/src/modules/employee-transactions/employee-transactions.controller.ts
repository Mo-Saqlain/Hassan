import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { EmployeeTransactionsService } from './employee-transactions.service';
import { CreateEmployeeTransactionDto } from './dto/create-employee-transaction.dto';

@Controller('employee-transactions')
export class EmployeeTransactionsController {
  constructor(private readonly service: EmployeeTransactionsService) {}

  @Post() create(@Body() dto: CreateEmployeeTransactionDto) {
    return this.service.create(dto);
  }

  @Get() findAll(
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll(employeeId, from, to);
  }

  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
