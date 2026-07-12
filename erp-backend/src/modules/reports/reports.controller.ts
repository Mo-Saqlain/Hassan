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

  @Get('account-ledger/:id')
  accountLedger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.accountLedger(id, asOf ? new Date(asOf) : undefined);
  }

  @Get('account-balances')
  accountBalances() {
    return this.service.allAccountBalances();
  }

  @Get('employee-ledger/:id')
  employeeLedger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.employeeLedger(id, from, to);
  }

  @Get('employee-balances')
  employeeBalances() {
    return this.service.allEmployeeBalances();
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

  // Aging + profitability
  @Get('ar-aging')
  arAging(@Query('asOf') asOf?: string) {
    return this.service.arAging(asOf);
  }

  @Get('ar-aging/:customerId')
  arAgingDetail(
    @Param('customerId') customerId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.arAgingDetail(customerId, asOf);
  }

  @Get('ap-aging')
  apAging(@Query('asOf') asOf?: string) {
    return this.service.apAging(asOf);
  }

  @Get('ap-aging/:supplierId')
  apAgingDetail(
    @Param('supplierId') supplierId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.apAgingDetail(supplierId, asOf);
  }

  @Get('item-margins')
  itemMargins(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.itemMargins(from, to);
  }

  /** Sales-by-product summary grouped by category (units / revenue / profit).
   *  Optional `categoryId` or `brandId` narrows the scope; `from`/`to` bound
   *  the period. Powers the "Product Sales" report tab. */
  @Get('product-sales')
  productSales(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.service.productSales({ from, to, categoryId, brandId });
  }

  /** Which customers bought a given product scope, with units + invoice count
   *  + spend per customer. Scope via `itemId` | `categoryId` | `brandId`
   *  (first non-empty wins); `from`/`to` bound the period. Powers the
   *  "Customers by Product" report tab. */
  @Get('customers-by-product')
  customersByProduct(
    @Query('itemId') itemId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.customersByProduct({
      itemId,
      categoryId,
      brandId,
      from,
      to,
    });
  }

  /** Sales aged by item: how long since the unit last moved off the shelf.
   *  Surfaces dead-stock value + the slowest brands. Query: `asOf`. */
  @Get('slow-moving-stock')
  slowMovingStock(@Query('asOf') asOf?: string) {
    return this.service.slowMovingStock(asOf);
  }

  /** Brand-level margin roll-up + lowest-margin sales + high-discount sales.
   *  Powers the "Margins" tab on Financials. */
  @Get('margin-analytics')
  marginAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.marginAnalytics(from, to);
  }

  @Get('trial-balance')
  trialBalance(@Query('asOf') asOf?: string) {
    return this.service.trialBalance(asOf);
  }

  /** Income Statement derived from journal_lines (parallel to /income-statement). */
  @Get('income-statement-from-journals')
  incomeStatementFromJournals(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.incomeStatementFromJournals(from, to);
  }

  /** Balance Sheet derived from journal_lines (parallel to /balance-sheet). */
  @Get('balance-sheet-from-journals')
  balanceSheetFromJournals(@Query('asOf') asOf?: string) {
    return this.service.balanceSheetFromJournals(asOf);
  }
}
