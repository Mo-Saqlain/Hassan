import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { StockService } from '../stock/stock.service';
import { OutboxService } from '../outbox/outbox.service';
import { SalesService } from './sales.service';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { Payment } from '../payments/entities/payment.entity';
import { JournalEntry } from '../journals/entities/journal-entry.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';
import { JournalService } from '../journals/journal.service';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { PeriodsService } from '../periods/periods.service';
import { AccountsService } from '../accounts/accounts.service';

describe('SalesService', () => {
  let service: SalesService;
  let stock: StockService;
  let ds: DataSource;
  let itemId: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          inMemoryTypeOrm([
            Item, Brand, Category, Customer, Supplier, Store, Account,
            StockMovement, Sale, SaleItem, SyncQueueEntry, Sequence, Payment,
            JournalEntry, JournalLine, AccountingPeriod,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, StockMovement, Sale, SaleItem, SyncQueueEntry, Sequence,
          Account, JournalEntry, JournalLine, AccountingPeriod,
        ]),
      ],
      providers: [
        SalesService, StockService, OutboxService, SequenceService,
        AccountsService, JournalService, PeriodsService,
      ],
    }).compile();
    // .init() triggers onModuleInit lifecycle hooks. AccountsService.onModuleInit
    // seeds the system accounts (REVENUE / COGS / INVENTORY / A_R / A_P /
    // CASH_ON_HAND) that the journal posting relies on — without this call
    // the seeder never runs in tests.
    await module.init();

    service = module.get(SalesService);
    stock = module.get(StockService);
    ds = module.get(DataSource);

    const item = await ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        name: 'Phone', sku: 'PHN-1',
        purchasePrice: 300, salePrice: 500,
      }),
    );
    itemId = item.id;

    await stock.recordMovement({
      itemId, type: 'IN', quantity: 10,
      referenceType: 'PURCHASE', referenceId: 'seed',
    });
  });

  afterEach(async () => {
    delete process.env.CLOUD_SYNC_URL;
    await ds.destroy();
  });

  it('creates a sale, decrements stock atomically', async () => {
    const sale = await service.create({
      lines: [{ itemId, quantity: 3, unitPrice: 500 }],
    });
    expect(sale.invoiceNo).toMatch(/^INV-/);
    expect(Number(sale.totalAmount)).toBe(1500);
    expect(Number(sale.netAmount)).toBe(1500);
    expect(Number(sale.paidAmount)).toBe(1500); // default
    expect(Number(sale.dueAmount)).toBe(0);
    expect(await stock.getOnHand(itemId)).toBe(7);
  });

  it('auto-generates sequential invoice numbers', async () => {
    const s1 = await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 500 }] });
    const s2 = await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 500 }] });
    expect(s1.invoiceNo).toBe('INV-000001');
    expect(s2.invoiceNo).toBe('INV-000002');
  });

  it('honours partial payment, leaves dueAmount positive', async () => {
    const sale = await service.create({
      lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      paidAmount: 400,
    });
    expect(Number(sale.netAmount)).toBe(1000);
    expect(Number(sale.paidAmount)).toBe(400);
    expect(Number(sale.dueAmount)).toBe(600);
  });

  it('applies discount to net amount', async () => {
    const sale = await service.create({
      lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      discount: 100,
      paidAmount: 0,
    });
    expect(Number(sale.totalAmount)).toBe(1000);
    expect(Number(sale.discount)).toBe(100);
    expect(Number(sale.netAmount)).toBe(900);
    expect(Number(sale.dueAmount)).toBe(900);
  });

  it('rolls back entire transaction when stock insufficient', async () => {
    const before = await stock.getOnHand(itemId);
    await expect(
      service.create({ lines: [{ itemId, quantity: 999, unitPrice: 500 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Neither sale row nor stock movement should have been written.
    expect(await stock.getOnHand(itemId)).toBe(before);
    expect(await ds.getRepository(Sale).count()).toBe(0);
  });

  it('rejects unknown item id', async () => {
    await expect(
      service.create({
        lines: [{
          itemId: '00000000-0000-0000-0000-000000000000',
          quantity: 1, unitPrice: 100,
        }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does NOT enqueue outbox event when CLOUD_SYNC_URL is unset', async () => {
    await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 500 }] });
    expect(await ds.getRepository(SyncQueueEntry).count()).toBe(0);
  });

  it('enqueues SALE_CREATED outbox event when CLOUD_SYNC_URL is set', async () => {
    process.env.CLOUD_SYNC_URL = 'http://cloud/api/sync/push';
    await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 500 }] });
    const entries = await ds.getRepository(SyncQueueEntry).find();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('SALE_CREATED');
    expect(entries[0].status).toBe('PENDING');
  });

  it('skipOutbox flag suppresses enqueue even with CLOUD_SYNC_URL set', async () => {
    process.env.CLOUD_SYNC_URL = 'http://cloud/api/sync/push';
    await service.create(
      { lines: [{ itemId, quantity: 1, unitPrice: 500 }] },
      { skipOutbox: true },
    );
    expect(await ds.getRepository(SyncQueueEntry).count()).toBe(0);
  });

  describe('credit-limit gating', () => {
    let customerId: string;

    beforeEach(async () => {
      const c = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Walk-in Cust',
          openingBalance: 0,
          creditLimit: 1000,
          creditEnabled: false,
        }),
      );
      customerId = c.id;
    });

    it('rejects a CREDIT sale when creditEnabled is false', async () => {
      await expect(
        service.create({
          customerId,
          paymentMethod: 'CREDIT',
          paidAmount: 0,
          lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      // sale should not have been persisted, stock unchanged
      expect(await ds.getRepository(Sale).count()).toBe(0);
    });

    it('rejects a partial-pay sale that would exceed the credit limit', async () => {
      // enable credit, raise limit small
      await ds.getRepository(Customer).update(customerId, {
        creditEnabled: true,
        creditLimit: 200,
      });
      // sale netAmount 500, paid 100 → dueAmount 400 > 200 limit
      await expect(
        service.create({
          customerId,
          paymentMethod: 'CASH',
          paidAmount: 100,
          lines: [{ itemId, quantity: 1, unitPrice: 500 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a partial-pay sale within the credit limit', async () => {
      await ds.getRepository(Customer).update(customerId, {
        creditEnabled: true,
        creditLimit: 2000,
      });
      const sale = await service.create({
        customerId,
        paymentMethod: 'CASH',
        paidAmount: 100,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      expect(Number(sale.dueAmount)).toBe(400);
    });

    it('skips the gate when there is no customer (walk-in cash sale)', async () => {
      const sale = await service.create({
        paymentMethod: 'CASH',
        paidAmount: 0,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      expect(Number(sale.dueAmount)).toBe(500);
    });

    it('counts existing unpaid sales when computing outstanding', async () => {
      await ds.getRepository(Customer).update(customerId, {
        creditEnabled: true,
        creditLimit: 1000,
      });
      // first sale: dueAmount 400 → outstanding 400
      await service.create({
        customerId,
        paymentMethod: 'CASH',
        paidAmount: 100,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      // second sale would push outstanding to 400 + 700 = 1100 > 1000
      await expect(
        service.create({
          customerId,
          paymentMethod: 'CASH',
          paidAmount: 100,
          lines: [{ itemId, quantity: 1, unitPrice: 800 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('journal posting', () => {
    it('posts a balanced 4-line entry for a fully-paid cash sale', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      });
      const entry = await ds.getRepository(JournalEntry).findOne({
        where: { sourceModule: 'SALE', sourceRef: sale.invoiceNo },
        relations: ['lines'],
      });
      expect(entry).toBeDefined();
      const totalDr = entry!.lines.reduce((s, l) => s + Number(l.debit), 0);
      const totalCr = entry!.lines.reduce((s, l) => s + Number(l.credit), 0);
      // Revenue Cr 1000, Cash Dr 1000, COGS Dr 600, Inventory Cr 600
      expect(totalDr).toBe(1600);
      expect(totalCr).toBe(1600);
    });

    it('posts an A/R debit when the sale leaves a due amount', async () => {
      const customer = await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({
          name: 'Credit Cust',
          creditEnabled: true,
          creditLimit: 100000,
        }),
      );
      const sale = await service.create({
        customerId: customer.id,
        paymentMethod: 'CREDIT',
        paidAmount: 0,
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      const entry = await ds.getRepository(JournalEntry).findOne({
        where: { sourceModule: 'SALE', sourceRef: sale.invoiceNo },
        relations: ['lines'],
      });
      const arDebit = entry!.lines.find((l) => Number(l.debit) === 500 && Number(l.credit) === 0);
      expect(arDebit).toBeDefined();
    });
  });

  describe('reversal', () => {
    it('rejects a reversal with empty reason', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      await expect(service.reverse(sale.id, { reason: '' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('marks the sale reversed, books a stock IN, and posts a balancing journal entry', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 2, unitPrice: 500 }],
      });
      const onHandBefore = await stock.getOnHand(itemId);
      const reversed = await service.reverse(sale.id, { reason: 'wrong item' });
      expect(reversed.reversedAt).toBeDefined();
      expect(reversed.reversalReason).toBe('wrong item');
      // Stock back up by 2
      expect(await stock.getOnHand(itemId)).toBe(onHandBefore + 2);
      // Reversal journal entry exists and is linked
      const original = await ds.getRepository(JournalEntry).findOne({
        where: { sourceModule: 'SALE', sourceRef: sale.invoiceNo },
      });
      const reversal = await ds.getRepository(JournalEntry).findOne({
        where: { reversesJournalEntryId: original!.id },
        relations: ['lines'],
      });
      expect(reversal).toBeDefined();
      // Reversal totals match original — net zero across the pair
      const revDr = reversal!.lines.reduce((s, l) => s + Number(l.debit), 0);
      const revCr = reversal!.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(revDr).toBe(revCr); // balanced
    });

    it('is idempotent — second reverse is a no-op', async () => {
      const sale = await service.create({
        lines: [{ itemId, quantity: 1, unitPrice: 500 }],
      });
      await service.reverse(sale.id, { reason: 'first' });
      const onHand = await stock.getOnHand(itemId);
      await service.reverse(sale.id, { reason: 'second' });
      // Stock should NOT increase a second time
      expect(await stock.getOnHand(itemId)).toBe(onHand);
    });
  });
});
