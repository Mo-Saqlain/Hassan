import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Store } from '../stores/entities/store.entity';
import { Account } from '../accounts/entities/account.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { StockService } from '../stock/stock.service';
import { OutboxService } from '../outbox/outbox.service';
import { SalesService } from './sales.service';

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
            Item, Brand, Category, Customer, Store, Account,
            StockMovement, Sale, SaleItem, SyncQueueEntry,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, StockMovement, Sale, SaleItem, SyncQueueEntry,
        ]),
      ],
      providers: [SalesService, StockService, OutboxService],
    }).compile();

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
});
