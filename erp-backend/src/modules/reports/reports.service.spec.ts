import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';

import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import { Account } from '../accounts/entities/account.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { PurchaseItem } from '../purchases/entities/purchase-item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';
import { PurchaseReturn } from '../returns/entities/purchase-return.entity';
import { PurchaseReturnItem } from '../returns/entities/purchase-return-item.entity';
import { Payment } from '../payments/entities/payment.entity';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { IncentiveTarget } from '../incentives/entities/incentive-target.entity';
import { IncentiveAward } from '../incentives/entities/incentive-award.entity';
import { FundTransfer } from '../fund-transfers/entities/fund-transfer.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeTransaction } from '../employee-transactions/entities/employee-transaction.entity';
import { EmployeeIncentiveRule } from '../employee-incentives/entities/employee-incentive-rule.entity';

import { ItemsService } from '../items/items.service';
import { StockService } from '../stock/stock.service';
import { OutboxService } from '../outbox/outbox.service';
import { SalesService } from '../sales/sales.service';
import { PurchasesService } from '../purchases/purchases.service';
import { ReportsService } from './reports.service';
import { IncentivesService } from '../incentives/incentives.service';
import { FundTransfersService } from '../fund-transfers/fund-transfers.service';
import { EmployeeIncentivesService } from '../employee-incentives/employee-incentives.service';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { AccountsService } from '../accounts/accounts.service';
import { JournalEntry } from '../journals/entities/journal-entry.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';
import { JournalService } from '../journals/journal.service';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { PeriodsService } from '../periods/periods.service';

describe('ReportsService', () => {
  let reports: ReportsService;
  let sales: SalesService;
  let purchases: PurchasesService;
  let ds: DataSource;
  let items: ItemsService;
  let stock: StockService;
  let itemId: string;
  let customerId: string;
  let supplierId: string;
  let accountId: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          inMemoryTypeOrm([
            Item, Brand, Category, Customer, Supplier, Store, Account,
            StockMovement, Sale, SaleItem, Purchase, PurchaseItem,
            SaleReturn, SaleReturnItem, PurchaseReturn, PurchaseReturnItem,
            Payment, SyncQueueEntry, IncentiveTarget, IncentiveAward,
            FundTransfer, Employee, EmployeeTransaction, EmployeeIncentiveRule,
            Sequence, JournalEntry, JournalLine, AccountingPeriod,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, Category, Customer, Supplier, Account,
          StockMovement, Sale, SaleItem, Purchase, PurchaseItem,
          SaleReturn, SaleReturnItem, PurchaseReturn, PurchaseReturnItem,
          Payment, SyncQueueEntry, IncentiveTarget, IncentiveAward,
          FundTransfer, Employee, EmployeeTransaction, EmployeeIncentiveRule,
          Sequence, JournalEntry, JournalLine, AccountingPeriod,
        ]),
      ],
      providers: [
        ReportsService, ItemsService, StockService, OutboxService,
        SalesService, PurchasesService, IncentivesService,
        FundTransfersService, EmployeeIncentivesService, SequenceService,
        AccountsService, JournalService, PeriodsService,
      ],
    }).compile();
    await module.init();

    reports = module.get(ReportsService);
    sales = module.get(SalesService);
    purchases = module.get(PurchasesService);
    items = module.get(ItemsService);
    stock = module.get(StockService);
    ds = module.get(DataSource);

    const item = await items.create({
      name: 'Phone', sku: 'PHN-1',
      purchasePrice: 300, salePrice: 500,
    });
    itemId = item.id;

    const customer = await ds.getRepository(Customer).save(
      ds.getRepository(Customer).create({
        name: 'C1',
        creditEnabled: true,
        creditLimit: 1_000_000, // effectively unlimited for ledger-math tests
      }),
    );
    customerId = customer.id;

    const supplier = await ds.getRepository(Supplier).save(
      ds.getRepository(Supplier).create({ name: 'S1' }),
    );
    supplierId = supplier.id;

    const account = await ds.getRepository(Account).save(
      ds.getRepository(Account).create({
        name: 'Cash', type: 'CASH', openingBalance: 1000,
      }),
    );
    accountId = account.id;

    // Seed: buy 20 → sell 5 (full pay) → sell 3 (no pay)
    await purchases.create({
      supplierId,
      lines: [{ itemId, quantity: 20, unitPrice: 300 }],
    });
    await sales.create({
      customerId,
      lines: [{ itemId, quantity: 5, unitPrice: 500 }],
    });
    await sales.create({
      customerId,
      paidAmount: 0,
      lines: [{ itemId, quantity: 3, unitPrice: 500 }],
    });
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('customer ledger: shows sale debits, paid-at-sale credits, running balance = unpaid sale net', async () => {
    const ledger = await reports.customerLedger(customerId);
    // First sale (5 x 500 = 2500) fully paid → balance 0
    // Second sale (3 x 500 = 1500) unpaid → balance 1500
    expect(ledger.closingBalance).toBe(1500);
    // 2 sales × (debit + paid-at-sale-credit), second has no paid-at-sale
    expect(ledger.entries.filter((e) => e.type === 'SALE')).toHaveLength(2);
    expect(ledger.entries.filter((e) => e.type === 'PAID_AT_SALE')).toHaveLength(1);
  });

  it('supplier ledger: purchase credits the supplier (we owe them)', async () => {
    const ledger = await reports.supplierLedger(supplierId);
    expect(ledger.closingBalance).toBe(6000); // 20 × 300
    expect(ledger.entries.filter((e) => e.type === 'PURCHASE')).toHaveLength(1);
  });

  it('receipt voucher reduces customer outstanding', async () => {
    await ds.getRepository(Payment).save(
      ds.getRepository(Payment).create({
        voucherNo: 'RCT-1',
        direction: 'IN',
        accountId,
        customerId,
        amount: 500,
      }),
    );
    const ledger = await reports.customerLedger(customerId);
    expect(ledger.closingBalance).toBe(1000); // 1500 - 500
  });

  it('payment voucher reduces supplier liability', async () => {
    await ds.getRepository(Payment).save(
      ds.getRepository(Payment).create({
        voucherNo: 'PMT-1',
        direction: 'OUT',
        accountId,
        supplierId,
        amount: 2000,
      }),
    );
    const ledger = await reports.supplierLedger(supplierId);
    expect(ledger.closingBalance).toBe(4000); // 6000 - 2000
  });

  it('allCustomerBalances returns one entry per customer with balance', async () => {
    const list = await reports.allCustomerBalances();
    expect(list).toHaveLength(1);
    expect(list[0].balance).toBe(1500);
  });

  it('stockLedger filtered by itemId returns running balance', async () => {
    const r = await reports.stockLedger({ itemId });
    expect(r.totalIn).toBe(20);
    expect(r.totalOut).toBe(8);
    expect(r.netChange).toBe(12);
    expect(r.movements[r.movements.length - 1].runningBalance).toBe(12);
  });

  it('income statement: revenue, COGS, gross profit', async () => {
    const stmt = await reports.incomeStatement();
    expect(stmt.revenue.grossRevenue).toBe(4000); // 2500 + 1500
    expect(stmt.revenue.netRevenue).toBe(4000);
    expect(stmt.cogs.cogs).toBe(2400); // (5 + 3) × 300
    expect(stmt.grossProfit).toBe(1600);
    expect(stmt.netIncome).toBe(1600);
  });

  it('balance sheet: assets = liabilities + equity', async () => {
    const bs = await reports.balanceSheet();
    expect(bs.assets.total).toBeCloseTo(
      bs.liabilities.total + bs.equity.total,
      6,
    );
  });

  it('balance sheet: inventory is on-hand × purchase price', async () => {
    const bs = await reports.balanceSheet();
    expect(bs.assets.inventory).toBe(12 * 300); // 12 on-hand × 300 cost
  });

  it('balance sheet: A/R equals sum of customer balances', async () => {
    const bs = await reports.balanceSheet();
    expect(bs.assets.accountsReceivable).toBe(1500);
  });

  it('balance sheet: A/P equals sum of supplier balances', async () => {
    const bs = await reports.balanceSheet();
    expect(bs.liabilities.accountsPayable).toBe(6000);
  });

  it('cash flow: receipts increase ending cash', async () => {
    await ds.getRepository(Payment).save(
      ds.getRepository(Payment).create({
        voucherNo: 'RCT-1', direction: 'IN',
        accountId, customerId, amount: 700,
      }),
    );
    const cf = await reports.cashFlow();
    expect(cf.operating.receipts).toBe(700);
    expect(cf.operating.inflows).toBeGreaterThanOrEqual(700);
  });

  it('equity changes: opening + net income matches the reconciliation row', async () => {
    const eq = await reports.equityChanges();
    expect(eq.balanceCheck.expected).toBe(eq.openingEquity + eq.netIncome);
  });

  it('AR aging: customer with an unpaid sale shows the residual in 0-30 bucket', async () => {
    // Seed includes a sale of 3 × Rs 500 with paidAmount=0 → dueAmount 1500
    const r = await reports.arAging();
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.name).toBe('C1');
    expect(row.total).toBe(1500);
    expect(row.d0_30).toBe(1500);
    expect(row.d31_60).toBe(0);
  });

  it('AR aging: FIFO consumes the unpaid sale when a receipt is recorded', async () => {
    await ds.getRepository(Payment).save(
      ds.getRepository(Payment).create({
        voucherNo: 'RCT-AGE-1', direction: 'IN',
        accountId, customerId, amount: 1500,
      }),
    );
    const r = await reports.arAging();
    expect(r.rows).toHaveLength(0); // all consumed
  });

  it('AR aging: excludes customers without outstanding balance', async () => {
    const other = await ds.getRepository(Customer).save(
      ds.getRepository(Customer).create({ name: 'Z-cust', creditEnabled: true, creditLimit: 100000 }),
    );
    void other;
    const r = await reports.arAging();
    expect(r.rows.find((x) => x.name === 'Z-cust')).toBeUndefined();
  });

  it('AP aging: supplier with unpaid purchase shows residual in 0-30 bucket', async () => {
    // Seeded purchase: 20 × 300 = 6000, default paidAmount=0 → due 6000.
    // Add a new partial-pay purchase: 5 × 300 = 1500, paid 1000 → due 500.
    await purchases.create({
      supplierId,
      paidAmount: 1000,
      lines: [{ itemId, quantity: 5, unitPrice: 300 }],
    });
    const r = await reports.apAging();
    const row = r.rows.find((x) => x.name === 'S1');
    expect(row).toBeDefined();
    expect(row!.total).toBe(6500); // 6000 seeded + 500 new
    expect(row!.d0_30).toBe(6500);
  });

  it('item margins: revenue, COGS, and gross profit per item', async () => {
    // Seed: 5 + 3 sold @ Rs 500; item purchasePrice 300 → COGS 8 × 300 = 2400
    const m = await reports.itemMargins();
    expect(m.rows).toHaveLength(1);
    const row = m.rows[0];
    expect(row.qty).toBe(8);
    expect(row.revenue).toBe(4000);
    expect(row.cogs).toBe(2400);
    expect(row.grossProfit).toBe(1600);
    expect(row.marginPct).toBeCloseTo(40, 1);
  });

  it('trial balance: totals balance across all sales+purchase journal entries from the seed', async () => {
    const tb = await reports.trialBalance();
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    // The seed produced: 1 purchase (Dr Inventory 6000, Cr A/P 6000)
    // + 1 fully-paid sale (Dr Cash 2500, Dr COGS 1500, Cr Revenue 2500, Cr Inventory 1500)
    // + 1 unpaid sale (Dr A/R 1500, Dr COGS 900, Cr Revenue 1500, Cr Inventory 900)
    // Each balanced individually, so the rollup is balanced too.
    expect(tb.totalDebit).toBeGreaterThan(0);
    // Revenue account shows the total credit.
    const revRow = tb.rows.find((r) => r.name === 'Sales Revenue');
    expect(revRow).toBeDefined();
    expect(revRow!.credit).toBe(4000); // 2500 + 1500
  });

  it('journal-driven Income Statement: revenue 4000 - COGS 2400 = net income 1600', async () => {
    const ic = await reports.incomeStatementFromJournals();
    expect(ic.revenue).toBe(4000);
    expect(ic.expense).toBe(2400); // COGS only — no operating expenses seeded
    expect(ic.netIncome).toBe(1600);
    expect(ic.source).toBe('journals');
  });

  it('journal-driven Balance Sheet: assets === liabilities + equity + earnings', async () => {
    const bs = await reports.balanceSheetFromJournals();
    expect(bs.balanced).toBe(true);
    expect(bs.assets).toBeGreaterThan(0);
    // Identity: A = L + E + earnings
    expect(bs.assets).toBe(bs.totalLiabilitiesAndEquity);
    // Earnings echo the income statement
    expect(bs.currentPeriodEarnings).toBe(1600);
  });
});
