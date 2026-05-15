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
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { PosSession } from './entities/pos-session.entity';
import { PosCartItem } from './entities/pos-cart-item.entity';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { ItemsService } from '../items/items.service';
import { StockService } from '../stock/stock.service';
import { OutboxService } from '../outbox/outbox.service';
import { SalesService } from '../sales/sales.service';
import { PosService } from './pos.service';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { Payment } from '../payments/entities/payment.entity';
import { JournalEntry } from '../journals/entities/journal-entry.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';
import { JournalService } from '../journals/journal.service';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { PeriodsService } from '../periods/periods.service';
import { AccountsService } from '../accounts/accounts.service';

describe('PosService', () => {
  let service: PosService;
  let items: ItemsService;
  let stock: StockService;
  let ds: DataSource;
  let itemId: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          inMemoryTypeOrm([
            Item, Brand, Category, Customer, Supplier, Store, Account,
            StockMovement, Sale, SaleItem,
            PosSession, PosCartItem, SyncQueueEntry, Sequence, Payment,
            JournalEntry, JournalLine, AccountingPeriod,
          ]),
        ),
        TypeOrmModule.forFeature([
          Item, Category, StockMovement, Sale, SaleItem,
          PosSession, PosCartItem, SyncQueueEntry, Sequence,
          Account, JournalEntry, JournalLine, AccountingPeriod,
        ]),
      ],
      providers: [
        PosService, ItemsService, SalesService,
        StockService, OutboxService, SequenceService,
        AccountsService, JournalService, PeriodsService,
      ],
    }).compile();
    await module.init();

    service = module.get(PosService);
    items = module.get(ItemsService);
    stock = module.get(StockService);
    ds = module.get(DataSource);

    const item = await items.create({
      name: 'Phone', sku: 'PHN-1', barcode: '999',
      purchasePrice: 300, salePrice: 500,
    });
    itemId = item.id;

    await stock.recordMovement({
      itemId, type: 'IN', quantity: 20,
      referenceType: 'PURCHASE', referenceId: 'seed',
    });
  });

  afterEach(async () => {
    delete process.env.CLOUD_SYNC_URL;
    await ds.destroy();
  });

  it('starts and closes a session', async () => {
    const s = await service.startSession({ openingFloat: 100 });
    expect(s.status).toBe('ACTIVE');
    const active = await service.getActiveSession();
    expect(active?.id).toBe(s.id);

    const closed = await service.closeSession(s.id, {});
    expect(closed.status).toBe('CLOSED');
    expect(closed.endedAt).toBeDefined();
  });

  it('closing an already-closed session throws', async () => {
    const s = await service.startSession({});
    await service.closeSession(s.id, {});
    await expect(service.closeSession(s.id, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds an item to cart by SKU', async () => {
    const s = await service.startSession({});
    const line = await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    expect(line.itemId).toBe(itemId);
    expect(line.quantity).toBe(1);
    expect(Number(line.price)).toBe(500);
    expect(Number(line.total)).toBe(500);
  });

  it('adds an item by barcode', async () => {
    const s = await service.startSession({});
    const line = await service.addToCart(s.id, { code: '999', quantity: 2 });
    expect(line.itemId).toBe(itemId);
    expect(line.quantity).toBe(2);
  });

  it('stacks same item on re-scan instead of duplicating', async () => {
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 2 });
    const line = await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    expect(line.quantity).toBe(3);
    expect(Number(line.total)).toBe(1500);
    const cart = await service.listCart(s.id);
    expect(cart).toHaveLength(1);
  });

  it('rejects unknown code', async () => {
    const s = await service.startSession({});
    await expect(
      service.addToCart(s.id, { code: 'NOPE', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects operations on inactive session', async () => {
    const s = await service.startSession({});
    await service.closeSession(s.id, {});
    await expect(
      service.addToCart(s.id, { code: 'PHN-1', quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates quantity on a cart line', async () => {
    const s = await service.startSession({});
    const line = await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    const updated = await service.updateCartItem(line.id, { quantity: 5 });
    expect(updated.quantity).toBe(5);
    expect(Number(updated.total)).toBe(2500);
  });

  it('removes a single cart line', async () => {
    const s = await service.startSession({});
    const line = await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    await service.removeCartItem(line.id);
    const cart = await service.listCart(s.id);
    expect(cart).toHaveLength(0);
  });

  it('clears all cart lines', async () => {
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    await service.clearCart(s.id);
    expect(await service.listCart(s.id)).toHaveLength(0);
  });

  it('checkout with empty cart throws', async () => {
    const s = await service.startSession({});
    await expect(service.checkout(s.id, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checkout creates a Sale, decrements stock, clears cart, updates session totals', async () => {
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 3 });

    const sale = await service.checkout(s.id, { paymentMethod: 'CASH' });
    expect(sale.invoiceNo).toMatch(/^INV-/);
    expect(Number(sale.netAmount)).toBe(1500);
    expect(await stock.getOnHand(itemId)).toBe(17); // 20 IN minus 3 OUT
    expect(await service.listCart(s.id)).toHaveLength(0);

    const refreshed = await service.findSession(s.id);
    expect(refreshed.salesCount).toBe(1);
    expect(Number(refreshed.salesTotal)).toBe(1500);
  });

  it('checkout with partial payment records dueAmount as receivable when customer is set', async () => {
    const customer = await ds.getRepository(Customer).save(
      ds.getRepository(Customer).create({
        name: 'Acme Co',
        creditEnabled: true,
        creditLimit: 1_000_000,
      }),
    );
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 2 }); // 1000

    const sale = await service.checkout(s.id, {
      paymentMethod: 'CASH',
      customerId: customer.id,
      paidAmount: 400,
    });
    expect(Number(sale.netAmount)).toBe(1000);
    expect(Number(sale.paidAmount)).toBe(400);
    expect(Number(sale.dueAmount)).toBe(600);
    expect(sale.customerId).toBe(customer.id);
  });

  it('checkout rejects partial payment without a customer', async () => {
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    await expect(
      service.checkout(s.id, { paymentMethod: 'CASH', paidAmount: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checkout rejects CREDIT sale without a customer', async () => {
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    await expect(
      service.checkout(s.id, { paymentMethod: 'CREDIT' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checkout persists accountId for non-CREDIT sales (so reports credit the right wallet)', async () => {
    const account = await ds.getRepository(Account).save(
      ds.getRepository(Account).create({ name: 'HBL Main', type: 'BANK' }),
    );
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    const sale = await service.checkout(s.id, {
      paymentMethod: 'BANK',
      accountId: account.id,
    });
    expect(sale.accountId).toBe(account.id);
    expect(sale.paymentMethod).toBe('BANK');
  });

  it('checkout strips accountId on CREDIT sales (full amount becomes A/R)', async () => {
    const customer = await ds.getRepository(Customer).save(
      ds.getRepository(Customer).create({
        name: 'Acme Co',
        creditEnabled: true,
        creditLimit: 1_000_000,
      }),
    );
    const account = await ds.getRepository(Account).save(
      ds.getRepository(Account).create({ name: 'HBL Main', type: 'BANK' }),
    );
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    const sale = await service.checkout(s.id, {
      paymentMethod: 'CREDIT',
      customerId: customer.id,
      accountId: account.id,
    });
    expect(sale.accountId).toBeNull();
    expect(Number(sale.paidAmount)).toBe(0);
    expect(Number(sale.dueAmount)).toBe(500);
  });

  it('checkout enqueues POS_SALE_CREATED outbox event (not double SALE_CREATED) when CLOUD_SYNC_URL set', async () => {
    process.env.CLOUD_SYNC_URL = 'http://cloud/api/sync/push';
    const s = await service.startSession({});
    await service.addToCart(s.id, { code: 'PHN-1', quantity: 1 });
    await service.checkout(s.id, { paymentMethod: 'CASH' });

    const queue = await ds.getRepository(SyncQueueEntry).find();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('POS_SALE_CREATED');
  });
});
