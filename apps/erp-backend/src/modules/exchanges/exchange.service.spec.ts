import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
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
import { Sequence } from '../sequences/entities/sequence.entity';
import { JournalEntry } from '../journals/entities/journal-entry.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { ItemSerial } from '../item-serials/entities/item-serial.entity';

import { ItemsService } from '../items/items.service';
import { StockService } from '../stock/stock.service';
import { OutboxService } from '../outbox/outbox.service';
import { SalesService } from '../sales/sales.service';
import { ReturnsService } from '../returns/returns.service';
import { ReportsService } from '../reports/reports.service';
import { PurchasesService } from '../purchases/purchases.service';
import { PaymentsService } from '../payments/payments.service';
import { IncentivesService } from '../incentives/incentives.service';
import { FundTransfersService } from '../fund-transfers/fund-transfers.service';
import { EmployeeIncentivesService } from '../employee-incentives/employee-incentives.service';
import { SequenceService } from '../sequences/sequence.service';
import { AccountsService } from '../accounts/accounts.service';
import { JournalService } from '../journals/journal.service';
import { PeriodsService } from '../periods/periods.service';
import { ItemSerialsService } from '../item-serials/item-serials.service';
import { ExchangeService } from './exchange.service';

// Entities referenced transitively by ReportsService / the services above.
import { IncentiveTarget } from '../incentives/entities/incentive-target.entity';
import { IncentiveAward } from '../incentives/entities/incentive-award.entity';
import { FundTransfer } from '../fund-transfers/entities/fund-transfer.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeTransaction } from '../employee-transactions/entities/employee-transaction.entity';
import { EmployeeIncentiveRule } from '../employee-incentives/entities/employee-incentive-rule.entity';

describe('ExchangeService', () => {
  let exchange: ExchangeService;
  let reports: ReportsService;
  let purchases: PurchasesService;
  let sales: SalesService;
  let items: ItemsService;
  let stock: StockService;
  let returns: ReturnsService;
  let ds: DataSource;

  let oldItemId: string; // the item being returned
  let newItemId: string; // the item being bought
  let customerId: string;
  let supplierId: string;
  let accountId: string;

  const ENTITIES = [
    Item, Brand, Category, Customer, Supplier, Store, Account,
    StockMovement, Sale, SaleItem, Purchase, PurchaseItem,
    SaleReturn, SaleReturnItem, PurchaseReturn, PurchaseReturnItem,
    Payment, SyncQueueEntry, IncentiveTarget, IncentiveAward,
    FundTransfer, Employee, EmployeeTransaction, EmployeeIncentiveRule,
    Sequence, JournalEntry, JournalLine, AccountingPeriod, ItemSerial,
  ];

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm(ENTITIES)),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      providers: [
        ExchangeService, ReturnsService, ReportsService, ItemsService,
        StockService, OutboxService, SalesService, PurchasesService,
        IncentivesService, PaymentsService, FundTransfersService,
        EmployeeIncentivesService, SequenceService, AccountsService,
        JournalService, PeriodsService, ItemSerialsService, RecostService,
      ],
    }).compile();
    await module.init();

    exchange = module.get(ExchangeService);
    reports = module.get(ReportsService);
    purchases = module.get(PurchasesService);
    sales = module.get(SalesService);
    items = module.get(ItemsService);
    stock = module.get(StockService);
    returns = module.get(ReturnsService);
    ds = module.get(DataSource);

    const oldItem = await items.create({
      name: 'Old Fridge', sku: 'OLD-1', purchasePrice: 300, salePrice: 500,
      tracksSerials: false,
    });
    oldItemId = oldItem.id;
    const newItem = await items.create({
      name: 'New Fridge', sku: 'NEW-1', purchasePrice: 400, salePrice: 700,
      tracksSerials: false,
    });
    newItemId = newItem.id;

    // Deliberately credit-DISABLED — an exchange residual is credit-backed, so
    // it must still go through despite this (skipCreditGate).
    const customer = await ds.getRepository(Customer).save(
      ds.getRepository(Customer).create({
        name: 'C1', creditEnabled: false, creditLimit: 0,
      }),
    );
    customerId = customer.id;

    const supplier = await ds.getRepository(Supplier).save(
      ds.getRepository(Supplier).create({ name: 'S1' }),
    );
    supplierId = supplier.id;

    const account = await ds.getRepository(Account).save(
      ds.getRepository(Account).create({ name: 'Cash', type: 'CASH', openingBalance: 0 }),
    );
    accountId = account.id;

    // Stock both items, then the customer's original purchase of the old one.
    await purchases.create({
      supplierId,
      lines: [
        { itemId: oldItemId, quantity: 10, unitPrice: 300 },
        { itemId: newItemId, quantity: 10, unitPrice: 400 },
      ],
    });
    // Original sale: old fridge, fully paid. Stock old → 9, customer balance 0.
    await sales.create({
      customerId,
      accountId,
      lines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
    });
  });

  afterEach(async () => {
    await ds.destroy();
  });

  const onHand = async (itemId: string) => {
    const r = await reports.stockLedger({ itemId });
    return r.totalIn - r.totalOut;
  };
  const custBalance = async () =>
    (await reports.allCustomerBalances()).find((c) => c.id === customerId)!.balance;

  it('RESTOCK exchange: goods swap, stock adjusts, balances net to zero, return links to sale', async () => {
    const res = await exchange.create({
      customerId,
      returnDisposition: 'RESTOCK',
      returnLines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
      saleLines: [{ itemId: newItemId, quantity: 1, unitPrice: 700 }],
      paymentAmount: 200,
      paymentAccountId: accountId,
    });

    // Old fridge came back to the shelf (9 → 10); new fridge left (10 → 9).
    expect(await onHand(oldItemId)).toBe(10);
    expect(await onHand(newItemId)).toBe(9);

    // 500 return credit + 200 cash exactly covers the 700 new sale.
    expect(res.difference).toBeCloseTo(0, 2);
    expect(await custBalance()).toBeCloseTo(0, 2);

    // Traceable both ways.
    expect(res.saleReturn.replacementSaleId).toBe(res.sale.id);
    expect(res.saleReturn.disposition).toBe('RESTOCK');
    expect(res.purchaseReturn).toBeUndefined();
  });

  it('CLAIMED_TO_COMPANY exchange: no restock, supplier credited, balances net to zero', async () => {
    const supBefore = (await reports.supplierLedger(supplierId)).closingBalance;

    const res = await exchange.create({
      customerId,
      returnDisposition: 'CLAIMED_TO_COMPANY',
      returnLines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
      supplierCredit: { supplierId, amount: 300 },
      saleLines: [{ itemId: newItemId, quantity: 1, unitPrice: 700 }],
      paymentAmount: 200,
      paymentAccountId: accountId,
    });

    // Faulty unit went to the company — it must NOT re-enter our stock (stays 9).
    expect(await onHand(oldItemId)).toBe(9);
    expect(await onHand(newItemId)).toBe(9);

    // Supplier ledger credited by our cost (300).
    const supAfter = (await reports.supplierLedger(supplierId)).closingBalance;
    expect(supBefore - supAfter).toBeCloseTo(300, 2);
    expect(res.supplierCredit).toBe(300);
    expect(res.purchaseReturn?.disposition).toBe('WARRANTY_CREDIT');

    // Customer still nets to zero (500 credit + 200 cash = 700 new sale).
    expect(res.difference).toBeCloseTo(0, 2);
    expect(await custBalance()).toBeCloseTo(0, 2);
  });

  it('a company-claimed serial is written off (leaves our world), not returned to shelf', async () => {
    // Give the old item a tracked serial in SOLD state (as if from the sale).
    await ds.getRepository(ItemSerial).save(
      ds.getRepository(ItemSerial).create({
        serial: 'SN-OLD-1', itemId: oldItemId, status: 'SOLD',
        allocationStatus: 'DELIVERED',
      }),
    );

    await exchange.create({
      customerId,
      returnDisposition: 'CLAIMED_TO_COMPANY',
      returnLines: [
        { itemId: oldItemId, quantity: 1, unitPrice: 500, serials: ['SN-OLD-1'] },
      ],
      supplierCredit: { supplierId, amount: 300 },
      saleLines: [{ itemId: newItemId, quantity: 1, unitPrice: 700 }],
      paymentAmount: 200,
      paymentAccountId: accountId,
    });

    const serial = await ds
      .getRepository(ItemSerial)
      .findOne({ where: { serial: 'SN-OLD-1' } });
    expect(serial?.status).toBe('WRITE_OFF');
  });

  it('reverses a whole exchange — both legs, stock, and the customer balance', async () => {
    const res = await exchange.create({
      customerId,
      returnDisposition: 'RESTOCK',
      returnLines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
      saleLines: [{ itemId: newItemId, quantity: 1, unitPrice: 700 }],
      paymentAmount: 200,
      paymentAccountId: accountId,
    });
    expect(await onHand(oldItemId)).toBe(10);
    expect(await onHand(newItemId)).toBe(9);

    const reversed = await exchange.reverse(res.saleReturn.id, {
      reason: 'customer changed their mind',
    });

    // Both sides of the swap are back where they started.
    expect(await onHand(oldItemId)).toBe(9);
    expect(await onHand(newItemId)).toBe(10);
    expect(reversed.reversedAt).toBeTruthy();
    // Back to square one. The reversed sale drops out of A/R with BOTH its
    // debit and the 200 cash it carried, and the give-back's store credit goes
    // with it — so the customer neither owes nor is owed. That assumes the 200
    // difference was handed back over the counter, which is the same premise
    // every reversed cash sale rests on.
    expect(await custBalance()).toBeCloseTo(0, 2);
  });

  it('reverses the supplier warranty-credit leg too', async () => {
    const supBefore = (await reports.supplierLedger(supplierId)).closingBalance;
    const res = await exchange.create({
      customerId,
      returnDisposition: 'CLAIMED_TO_COMPANY',
      returnLines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
      supplierCredit: { supplierId, amount: 300 },
      saleLines: [{ itemId: newItemId, quantity: 1, unitPrice: 700 }],
      paymentAmount: 200,
      paymentAccountId: accountId,
    });
    // The credit leg is findable by link, not by parsing its reason text.
    expect(res.purchaseReturn?.linkedSaleReturnId).toBe(res.saleReturn.id);

    await exchange.reverse(res.saleReturn.id, { reason: 'claim rejected' });

    // Supplier is back to where they were — the credit no longer stands.
    const supAfter = (await reports.supplierLedger(supplierId)).closingBalance;
    expect(supAfter).toBeCloseTo(supBefore, 2);
  });

  it('refuses to reverse a plain return through the exchange endpoint', async () => {
    const plain = await returns.createSaleReturn({
      customerId,
      lines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
    });
    await expect(
      exchange.reverse(plain.id, { reason: 'nope' }),
    ).rejects.toThrow(/not an exchange/);
  });

  it('lists exchanges with both legs composed, and marks reversed ones', async () => {
    const res = await exchange.create({
      customerId,
      returnDisposition: 'RESTOCK',
      returnLines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
      saleLines: [{ itemId: newItemId, quantity: 1, unitPrice: 700 }],
      paymentAmount: 200,
      paymentAccountId: accountId,
    });
    // A plain return must not show up as an exchange.
    await returns.createSaleReturn({
      customerId,
      lines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
    });

    const before = await exchange.list();
    expect(before).toHaveLength(1);
    expect(before[0].returnNo).toBe(res.saleReturn.returnNo);
    expect(before[0].invoiceNo).toBe(res.sale.invoiceNo);
    expect(before[0].returnCredit).toBe(500);
    expect(before[0].cashCollected).toBe(200);
    expect(before[0].reversedAt).toBeNull();

    await exchange.reverse(res.saleReturn.id, { reason: 'undo' });
    const after = await exchange.list();
    expect(after[0].reversedAt).toBeTruthy();
  });

  it('rejects a supplier credit when the goods were not claimed to the company', async () => {
    await expect(
      exchange.create({
        customerId,
        returnDisposition: 'RESTOCK',
        returnLines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
        supplierCredit: { supplierId, amount: 300 },
        saleLines: [{ itemId: newItemId, quantity: 1, unitPrice: 700 }],
        paymentAmount: 200,
        paymentAccountId: accountId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cheaper replacement leaves the customer with leftover credit (negative difference)', async () => {
    // Return the 500 fridge, buy a 300 item, pay no cash → 200 credit remains.
    const res = await exchange.create({
      customerId,
      returnDisposition: 'RESTOCK',
      returnLines: [{ itemId: oldItemId, quantity: 1, unitPrice: 500 }],
      saleLines: [{ itemId: newItemId, quantity: 1, unitPrice: 300 }],
    });
    expect(res.difference).toBeCloseTo(-200, 2);
    // Customer is owed 200 (credit) → balance negative.
    expect(await custBalance()).toBeCloseTo(-200, 2);
  });
});
