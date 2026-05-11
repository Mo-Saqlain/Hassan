import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  // Ledgers
  @Get('customer-ledger/:id')
  customerLedger(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.customerLedger(id);
  }

  @Get('customer-balances')
  customerBalances() {
    return this.service.allCustomerBalances();
  }

  @Get('supplier-ledger/:id')
  supplierLedger(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.supplierLedger(id);
  }

  @Get('supplier-balances')
  supplierBalances() {
    return this.service.allSupplierBalances();
  }

  @Get('stock-ledger')
  stockLedger(
    @Query('itemId') itemId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.stockLedger({
      itemId,
      categoryId,
      brandId,
      supplierId,
      from,
      to,
    });
  }

  // Financial statements
  @Get('income-statement')
  incomeStatement(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.incomeStatement(from, to);
  }

  @Get('balance-sheet')
  balanceSheet(@Query('asOf') asOf?: string) {
    return this.service.balanceSheet(asOf);
  }

  @Get('cash-flow')
  cashFlow(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.cashFlow(from, to);
  }

  @Get('equity-changes')
  equityChanges(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.equityChanges(from, to);
  }
}
