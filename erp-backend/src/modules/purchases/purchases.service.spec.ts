import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { StockService } from '../stock/stock.service';
import { OutboxService } from '../outbox/outbox.service';
import { PurchasesService } from './purchases.service';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { Account } from '../accounts/entities/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import { JournalEntry } from '../journals/entities/journal-entry.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';
import { JournalService } from '../journals/journal.service';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { PeriodsService } from '../periods/periods.service';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let stock: StockService;
  let ds: DataSource;
  let itemId: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [

        TypeOrmModule.forRoot(
          inMemoryTypeOrm([
            Item, Brand, Category, Supplier, Store,
            StockMovement, Purchase, PurchaseItem, SyncQueueEntry, Sequence,
            Account, JournalEntry, JournalLine, AccountingPeriod,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, StockMovement, Purchase, PurchaseItem, SyncQueueEntry, Sequence,
          Account, JournalEntry, JournalLine, AccountingPeriod,
        ]),
      ],
      providers: [
        PurchasesService, StockService, OutboxService, SequenceService,
        AccountsService, JournalService, PeriodsService,
      ],
    }).compile();
    await module.init();

    service = module.get(PurchasesService);
    stock = module.get(StockService);
    ds = module.get(DataSource);

    const item = await ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        name: 'Phone', sku: 'PHN-1',
        purchasePrice: 300, salePrice: 500,
      }),
    );
    itemId = item.id;
  });

  afterEach(async () => {
    delete process.env.CLOUD_SYNC_URL;
    await ds.destroy();
  });

  it('creates a purchase, increments stock atomically', async () => {
    const p = await service.create({
      lines: [{ itemId, quantity: 10, unitPrice: 300 }],
    });
    expect(p.billNo).toMatch(/^BILL-/);
    expect(Number(p.totalAmount)).toBe(3000);
    expect(Number(p.netAmount)).toBe(3000);
    expect(Number(p.paidAmount)).toBe(0); // no default for purchases
    expect(Number(p.dueAmount)).toBe(3000);
    expect(await stock.getOnHand(itemId)).toBe(10);
  });

  it('auto-generates sequential bill numbers', async () => {
    const p1 = await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 300 }] });
    const p2 = await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 300 }] });
    expect(p1.billNo).toBe('BILL-000001');
    expect(p2.billNo).toBe('BILL-000002');
  });

  it('honours discount and paid amount', async () => {
    const p = await service.create({
      lines: [{ itemId, quantity: 4, unitPrice: 300 }],
      discount: 200,
      paidAmount: 500,
    });
    expect(Number(p.totalAmount)).toBe(1200);
    expect(Number(p.netAmount)).toBe(1000);
    expect(Number(p.paidAmount)).toBe(500);
    expect(Number(p.dueAmount)).toBe(500);
  });

  it('rejects unknown item id (and writes nothing)', async () => {
    await expect(
      service.create({
        lines: [{
          itemId: '00000000-0000-0000-0000-000000000000',
          quantity: 1, unitPrice: 100,
        }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await ds.getRepository(Purchase).count()).toBe(0);
  });

  it('enqueues PURCHASE_CREATED outbox event when CLOUD_SYNC_URL is set', async () => {
    process.env.CLOUD_SYNC_URL = 'http://cloud/api/sync/push';
    await service.create({ lines: [{ itemId, quantity: 1, unitPrice: 300 }] });
    const entries = await ds.getRepository(SyncQueueEntry).find();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('PURCHASE_CREATED');
  });

  it('splits a single purchase across multiple stores via per-line storeId', async () => {
    const storeRepo = ds.getRepository(Store);
    const s1 = await storeRepo.save(storeRepo.create({ name: 'Main' }));
    const s2 = await storeRepo.save(storeRepo.create({ name: 'Branch' }));

    await service.create({
      lines: [
        { itemId, storeId: s1.id, quantity: 5, unitPrice: 300 },
        { itemId, storeId: s2.id, quantity: 5, unitPrice: 300 },
      ],
    });

    expect(await stock.getOnHand(itemId, s1.id)).toBe(5);
    expect(await stock.getOnHand(itemId, s2.id)).toBe(5);
    expect(await stock.getOnHand(itemId)).toBe(10);
  });

  it('falls back to the header storeId when a line omits storeId', async () => {
    const storeRepo = ds.getRepository(Store);
    const main = await storeRepo.save(storeRepo.create({ name: 'Main' }));
    await service.create({
      storeId: main.id,
      lines: [{ itemId, quantity: 4, unitPrice: 300 }],
    });
    expect(await stock.getOnHand(itemId, main.id)).toBe(4);
  });
});
