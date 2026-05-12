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

import { ItemsService } from '../items/items.service';
import { StockService } from '../stock/stock.service';
import { OutboxService } from '../outbox/outbox.service';
import { SalesService } from '../sales/sales.service';
import { PurchasesService } from '../purchases/purchases.service';
import { ReportsService } from './reports.service';
import { IncentivesService } from '../incentives/incentives.service';
import { FundTransfersService } from '../fund-transfers/fund-transfers.service';

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
            FundTransfer,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, Category, Customer, Supplier, Account,
          StockMovement, Sale, SaleItem, Purchase, PurchaseItem,
          SaleReturn, SaleReturnItem, PurchaseReturn, PurchaseReturnItem,
          Payment, SyncQueueEntry, IncentiveTarget, IncentiveAward,
          FundTransfer,
        ]),
      ],
      providers: [
        ReportsService, ItemsService, StockService, OutboxService,
        SalesService, PurchasesService, IncentivesService,
        FundTransfersService,
      ],
    }).compile();

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
      ds.getRepository(Customer).create({ name: 'C1' }),
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
});
