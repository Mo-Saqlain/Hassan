import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { RecostService } from '../costing/recost.service';

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
import { PaymentsService } from '../payments/payments.service';
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
import { ItemSerial } from '../item-serials/entities/item-serial.entity';
import { ItemSerialsService } from '../item-serials/item-serials.service';

describe('ReportsService', () => {
  let reports: ReportsService;
  let sales: SalesService;
  let purchases: PurchasesService;
  let ds: DataSource;
  let items: ItemsService;
  let stock: StockService;
  let paymentsSvc: PaymentsService;
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
            Sequence, JournalEntry, JournalLine, AccountingPeriod, ItemSerial,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, Brand, Category, Customer, Supplier, Account,
          StockMovement, Sale, SaleItem, Purchase, PurchaseItem,
          SaleReturn, SaleReturnItem, PurchaseReturn, PurchaseReturnItem,
          Payment, SyncQueueEntry, IncentiveTarget, IncentiveAward,
          FundTransfer, Employee, EmployeeTransaction, EmployeeIncentiveRule,
          Sequence, JournalEntry, JournalLine, AccountingPeriod, ItemSerial,
        ]),
      ],
      providers: [
        ReportsService, ItemsService, StockService, OutboxService,
        SalesService, PurchasesService, IncentivesService, PaymentsService,
        FundTransfersService, EmployeeIncentivesService, SequenceService,
        AccountsService, JournalService, PeriodsService, ItemSerialsService, RecostService,
      ],
    }).compile();
    await module.init();

    reports = module.get(ReportsService);
    sales = module.get(SalesService);
    purchases = module.get(PurchasesService);
    items = module.get(ItemsService);
    stock = module.get(StockService);
    paymentsSvc = module.get(PaymentsService);
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

  // ── Sale-return A/R netting: a return credits A/R only by the store-credit
  //    portion (totalAmount − refundAmount). Cash handed back lives in the
  //    daily cash book, not A/R. Baseline balance before any return = 1500.
  const seedReturn = async (opts: {
    total: number;
    refundAccountId?: string;
    refundAmount?: number;
    reversed?: boolean;
  }) => {
    const repo = ds.getRepository(SaleReturn);
    await repo.save(
      repo.create({
        returnNo: `SR-${Math.round(opts.total)}-${opts.refundAmount ?? 'x'}${
          opts.reversed ? '-rev' : ''
        }`,
        customerId,
        totalAmount: opts.total,
        refundAccountId: opts.refundAccountId,
        refundAmount: opts.refundAmount,
        reversedAt: opts.reversed ? new Date() : undefined,
        reversalReason: opts.reversed ? 'booked in error' : undefined,
        lines: [
          ds.getRepository(SaleReturnItem).create({
            itemId,
            quantity: 1,
            unitPrice: opts.total,
            lineTotal: opts.total,
          }),
        ],
      }),
    );
  };

  it('return with no cash refund (store credit) reduces A/R by the full total', async () => {
    await seedReturn({ total: 500 });
    expect((await reports.customerLedger(customerId)).closingBalance).toBe(1000);
    expect((await reports.allCustomerBalances())[0].balance).toBe(1000);
  });

  it('return fully refunded in cash does NOT change A/R (customer made whole in cash)', async () => {
    await seedReturn({ total: 500, refundAccountId: accountId, refundAmount: 500 });
    expect((await reports.customerLedger(customerId)).closingBalance).toBe(1500);
    expect((await reports.allCustomerBalances())[0].balance).toBe(1500);
    // The ledger row annotates the cash refund for the reader.
    const row = (await reports.customerLedger(customerId)).entries.find(
      (e) => e.type === 'SALE_RETURN',
    );
    expect(row?.credit).toBe(0);
    expect(row?.description).toContain('refunded in cash');
  });

  it('return with partial cash refund credits A/R by the un-refunded remainder', async () => {
    await seedReturn({ total: 500, refundAccountId: accountId, refundAmount: 200 });
    // store credit = 500 − 200 = 300 → 1500 − 300 = 1200
    expect((await reports.customerLedger(customerId)).closingBalance).toBe(1200);
    expect((await reports.allCustomerBalances())[0].balance).toBe(1200);
  });

  it('a reversed receipt stops crediting the customer', async () => {
    // Baseline A/R is 1500 (the unpaid second sale).
    const receipt = await paymentsSvc.create({
      direction: 'IN', accountId, customerId, amount: 500,
    });
    expect((await reports.customerLedger(customerId)).closingBalance).toBe(1000);

    await paymentsSvc.reverse(receipt.id, { reason: 'receipted twice' });

    // The money never came in, so the customer owes the full amount again.
    expect((await reports.customerLedger(customerId)).closingBalance).toBe(1500);
    expect((await reports.allCustomerBalances())[0].balance).toBe(1500);
  });

  it('a reversed supplier payment stops reducing what we owe', async () => {
    const payment = await paymentsSvc.create({
      direction: 'OUT', accountId, supplierId, amount: 2000,
    });
    expect((await reports.supplierLedger(supplierId)).closingBalance).toBe(4000);

    await paymentsSvc.reverse(payment.id, { reason: 'paid the wrong supplier' });

    expect((await reports.supplierLedger(supplierId)).closingBalance).toBe(6000);
    expect((await reports.allSupplierBalances())[0].balance).toBe(6000);
  });

  it('reversing an unpaid sale clears the customer A/R it created', async () => {
    // Baseline 1500 is the unpaid second sale. Reversing it must remove the
    // debt: the goods came back, the journal was balanced out, and the customer
    // owes nothing for a sale that no longer stands.
    const unpaid = (await ds.getRepository(Sale).find({ order: { createdAt: 'DESC' } }))
      .find((s) => Number(s.dueAmount) > 0)!;

    await sales.reverse(unpaid.id, { reason: 'keyed against the wrong customer' });

    const ledger = await reports.customerLedger(customerId);
    expect(ledger.closingBalance).toBe(0);
    expect((await reports.allCustomerBalances())[0].balance).toBe(0);
  });

  it('reversing a purchase clears the supplier A/P it created', async () => {
    // A second bill, none of it sold on — the fixture's first bill can't be
    // reversed because 8 of its 20 units have already left, and the
    // negative-stock guard correctly refuses that.
    const dup = await purchases.create({
      supplierId,
      lines: [{ itemId, quantity: 5, unitPrice: 300 }],
    });
    expect((await reports.supplierLedger(supplierId)).closingBalance).toBe(7500);

    await purchases.reverse(dup.id, { reason: 'duplicate bill' });

    expect((await reports.supplierLedger(supplierId)).closingBalance).toBe(6000);
    expect((await reports.allSupplierBalances())[0].balance).toBe(6000);
  });

  it('a REVERSED sale return leaves A/R untouched (ledger and balances)', async () => {
    await seedReturn({ total: 500, reversed: true });
    // Baseline A/R is 1500. A live store-credit return would drop it to 1000;
    // a reversed one must not appear at all — this is what makes the reversal
    // actually fix the customer's balance rather than just flag the row.
    const ledger = await reports.customerLedger(customerId);
    expect(ledger.closingBalance).toBe(1500);
    expect(ledger.entries.filter((e) => e.type === 'SALE_RETURN')).toHaveLength(0);
    expect((await reports.allCustomerBalances())[0].balance).toBe(1500);
  });

  it('a REVERSED purchase return leaves A/P untouched (ledger and balances)', async () => {
    const repo = ds.getRepository(PurchaseReturn);
    await repo.save(
      repo.create({
        returnNo: 'PR-rev-1',
        supplierId,
        totalAmount: 900,
        reversedAt: new Date(),
        reversalReason: 'supplier refused it',
        lines: [
          ds.getRepository(PurchaseReturnItem).create({
            itemId,
            quantity: 3,
            unitPrice: 300,
            lineTotal: 900,
          }),
        ],
      }),
    );
    // Baseline A/P is 6000; a live return would cut it to 5100.
    const ledger = await reports.supplierLedger(supplierId);
    expect(ledger.closingBalance).toBe(6000);
    expect((await reports.allSupplierBalances())[0].balance).toBe(6000);
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

  it('product sales: units/revenue/profit per item grouped by category', async () => {
    // Seed sold 5 + 3 @ Rs 500 (revenue 4000), COGS 8 × 300 = 2400.
    const ps = await reports.productSales({});
    expect(ps.totals.qty).toBe(8);
    expect(ps.totals.revenue).toBe(4000);
    expect(ps.totals.cogs).toBe(2400);
    expect(ps.totals.grossProfit).toBe(1600);
    expect(ps.totals.marginPct).toBeCloseTo(40, 1);

    // Seed item carries no category → collapses under "Uncategorised".
    expect(ps.categories).toHaveLength(1);
    const cat = ps.categories[0];
    expect(cat.categoryName).toBe('Uncategorised');
    expect(cat.items).toHaveLength(1);
    expect(cat.items[0].sku).toBe('PHN-1');
    expect(cat.items[0].qty).toBe(8);
    expect(cat.items[0].grossProfit).toBe(1600);
  });

  it('customers by product: buyer rows carry units, invoice count, and spend', async () => {
    const cbp = await reports.customersByProduct({});
    expect(cbp.scope.type).toBe('all');
    expect(cbp.rows).toHaveLength(1);
    const row = cbp.rows[0];
    expect(row.name).toBe('C1');
    expect(row.qty).toBe(8); // 5 + 3 units
    expect(row.invoices).toBe(2); // two separate sales
    expect(row.spend).toBe(4000); // 2500 + 1500
    expect(cbp.totals.customers).toBe(1);
    expect(cbp.totals.qty).toBe(8);
    expect(cbp.totals.invoices).toBe(2);
  });

  it('customers by product: itemId scope sets an item label and still filters', async () => {
    const cbp = await reports.customersByProduct({ itemId });
    expect(cbp.scope.type).toBe('item');
    expect(cbp.scope.label).toContain('PHN-1');
    expect(cbp.rows).toHaveLength(1);
    expect(cbp.rows[0].qty).toBe(8);
  });

  it('customers by product: a scope that matches no items returns no buyers', async () => {
    const cbp = await reports.customersByProduct({
      brandId: '00000000-0000-0000-0000-000000000000',
    });
    expect(cbp.rows).toHaveLength(0);
    expect(cbp.totals.qty).toBe(0);
    expect(cbp.totals.customers).toBe(0);
  });

  it('employee ledger: EXPENSE (paid out of pocket) increases what we owe; reimbursement settles it', async () => {
    const empRepo = ds.getRepository(Employee);
    const txnRepo = ds.getRepository(EmployeeTransaction);
    const emp = await empRepo.save(empRepo.create({ name: 'Worker' }));
    const date = new Date().toISOString().slice(0, 10);

    // Employee buys shop tea for Rs 200 with their own money → we owe them 200.
    await txnRepo.save(
      txnRepo.create({
        voucherNo: 'EXP-T1',
        employeeId: emp.id,
        type: 'EXPENSE',
        transactionDate: date,
        amount: 200,
      }),
    );
    let led = await reports.employeeLedger(emp.id);
    expect(led.closingBalance).toBe(200); // positive = we owe the employee

    // Reimburse the 200 in cash → nets back to zero.
    await txnRepo.save(
      txnRepo.create({
        voucherNo: 'RBT-T1',
        employeeId: emp.id,
        type: 'REIMBURSEMENT',
        transactionDate: date,
        amount: 200,
        accountId,
      }),
    );
    led = await reports.employeeLedger(emp.id);
    expect(led.closingBalance).toBe(0);

    // Batched all-balances must agree with the per-employee ledger.
    const all = await reports.allEmployeeBalances();
    expect(all.find((r) => r.id === emp.id)?.balance).toBe(0);
  });

  it('loan to a customer: money OUT increases what they owe (Dr A/R / Cr Cash); a receipt settles it', async () => {
    // Seed leaves customer C1 owing 1500.
    const before = (await reports.customerLedger(customerId)).closingBalance;
    expect(before).toBe(1500);

    // Lend the customer (a friend) Rs 5000 in cash — a money-OUT voucher.
    await paymentsSvc.create({
      direction: 'OUT',
      customerId,
      accountId,
      amount: 5000,
    });
    const afterLoan = await reports.customerLedger(customerId);
    expect(afterLoan.closingBalance).toBe(before + 5000); // they now owe 6500
    expect(afterLoan.entries.some((e) => e.type === 'LOAN')).toBe(true);

    // The double-entry stays balanced (Dr A/R 5000 / Cr Cash 5000).
    expect((await reports.trialBalance()).balanced).toBe(true);

    // They repay Rs 2000 → owe 4500.
    await paymentsSvc.create({
      direction: 'IN',
      customerId,
      accountId,
      amount: 2000,
    });
    expect((await reports.customerLedger(customerId)).closingBalance).toBe(
      before + 3000,
    );

    // Batched balances (used by the balance sheet) agree.
    const all = await reports.allCustomerBalances();
    expect(all.find((c) => c.id === customerId)?.balance).toBe(before + 3000);
  });

  it('payment OUT with neither supplier nor customer is rejected', async () => {
    await expect(
      paymentsSvc.create({ direction: 'OUT', accountId, amount: 100 } as any),
    ).rejects.toThrow(/supplier|customer/i);
  });
});
