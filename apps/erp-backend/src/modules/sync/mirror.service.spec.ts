import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { SyncEvent } from './entities/sync-event.entity';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { OutboxService } from '../outbox/outbox.service';
import { MirrorSubscriber } from '../outbox/mirror.subscriber';
import { SyncService } from './sync.service';
import { SalesService } from '../sales/sales.service';
import { PurchasesService } from '../purchases/purchases.service';
import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Store } from '../stores/entities/store.entity';
import { Account } from '../accounts/entities/account.entity';
import { Employee } from '../employees/entities/employee.entity';

/**
 * The row-state mirror. What matters here is that the cloud ends up holding what
 * the shop holds — including master data, corrections and voids, none of which
 * the operation-replay events could carry.
 */
describe('Row-state mirror', () => {
  let sync: SyncService;
  let outbox: OutboxService;
  let ds: DataSource;

  const ENTITIES = [
    SyncEvent, SyncQueueEntry, Item, Brand, Category, Customer, Supplier,
    Store, Account, Employee,
  ];

  const queued = async () => {
    const rows = await ds.getRepository(SyncQueueEntry).find();
    return rows.map((r) => ({ type: r.type, payload: JSON.parse(r.payload) }));
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm(ENTITIES)),
        TypeOrmModule.forFeature(ENTITIES),
        ScheduleModule.forRoot(),
      ],
      providers: [
        SyncService,
        OutboxService,
        MirrorSubscriber,
        { provide: SalesService, useValue: { create: jest.fn() } },
        { provide: PurchasesService, useValue: { create: jest.fn() } },
      ],
    }).compile();
    await module.init();

    sync = module.get(SyncService);
    outbox = module.get(OutboxService);
    ds = module.get(DataSource);
  });

  afterEach(async () => {
    delete process.env.CLOUD_SYNC_URL;
    await ds.destroy();
  });

  // ── the subscriber (local side) ───────────────────────────────────────────

  it('queues nothing when no cloud is configured', async () => {
    await ds.getRepository(Customer).save(
      ds.getRepository(Customer).create({ name: 'Walk-in' }),
    );
    expect(await queued()).toHaveLength(0);
  });

  it('queues master data — the gap that made the cloud unbuildable', async () => {
    process.env.CLOUD_SYNC_URL = 'https://cloud.example/api/sync/push';

    const customer = await ds.getRepository(Customer).save(
      ds.getRepository(Customer).create({ name: 'Ali', phone: '03001234567' }),
    );

    const events = await queued();
    const ev = events.find((e) => e.payload.entity === 'Customer');
    expect(ev).toBeDefined();
    expect(ev!.type).toBe('ENTITY_UPSERT');
    expect(ev!.payload.id).toBe(customer.id);
    expect(ev!.payload.data.name).toBe('Ali');
    expect(ev!.payload.data.phone).toBe('03001234567');
  });

  it('queues an update too, so a correction reaches the cloud', async () => {
    const repo = ds.getRepository(Customer);
    const customer = await repo.save(repo.create({ name: 'Wrong name' }));

    process.env.CLOUD_SYNC_URL = 'https://cloud.example/api/sync/push';
    customer.name = 'Right name';
    await repo.save(customer);

    const events = await queued();
    expect(events).toHaveLength(1);
    expect(events[0].payload.data.name).toBe('Right name');
  });

  it('sends column values only, not relation graphs', async () => {
    process.env.CLOUD_SYNC_URL = 'https://cloud.example/api/sync/push';
    const brand = await ds.getRepository(Brand).save(
      ds.getRepository(Brand).create({ name: 'Haier' }),
    );
    await ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        name: 'Fridge', sku: 'F-1', brandId: brand.id,
      }),
    );

    const item = (await queued()).find((e) => e.payload.entity === 'Item')!;
    expect(item.payload.data.brandId).toBe(brand.id);
    // The eager `brand` object must not ride along — it has its own event.
    expect(item.payload.data.brand).toBeUndefined();
  });

  it('does not mirror users or the queue itself', async () => {
    process.env.CLOUD_SYNC_URL = 'https://cloud.example/api/sync/push';
    // Writing a queue row must not queue a row about queueing a row.
    await outbox.enqueue('SALE_CREATED', { anything: true });
    const events = await queued();
    expect(events.filter((e) => e.payload?.entity === 'SyncQueueEntry')).toHaveLength(0);
  });

  // ── the receiver (cloud side) ─────────────────────────────────────────────

  it('applies an upsert, then applies a correction over it', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const [created] = await sync.push([
      {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        type: 'ENTITY_UPSERT',
        payload: { entity: 'Customer', id, data: { id, name: 'Ali' } },
      },
    ]);
    expect(created.status).toBe('PROCESSED');
    expect(
      (await ds.getRepository(Customer).findOneByOrFail({ id })).name,
    ).toBe('Ali');

    const [updated] = await sync.push([
      {
        id: 'aaaaaaaa-0000-0000-0000-000000000002',
        type: 'ENTITY_UPSERT',
        payload: { entity: 'Customer', id, data: { id, name: 'Ali Raza' } },
      },
    ]);
    expect(updated.status).toBe('PROCESSED');
    // Same row, corrected — not a duplicate.
    expect(await ds.getRepository(Customer).count()).toBe(1);
    expect(
      (await ds.getRepository(Customer).findOneByOrFail({ id })).name,
    ).toBe('Ali Raza');
  });

  it('applies a delete', async () => {
    const id = '22222222-2222-2222-2222-222222222222';
    await sync.push([
      {
        id: 'bbbbbbbb-0000-0000-0000-000000000001',
        type: 'ENTITY_UPSERT',
        payload: { entity: 'Store', id, data: { id, name: 'Old shop' } },
      },
    ]);
    const [res] = await sync.push([
      {
        id: 'bbbbbbbb-0000-0000-0000-000000000002',
        type: 'ENTITY_DELETE',
        payload: { entity: 'Store', id },
      },
    ]);
    expect(res.status).toBe('PROCESSED');
    expect(await ds.getRepository(Store).count()).toBe(0);
  });

  it('refuses an entity outside the mirror whitelist', async () => {
    // The HMAC proves the shop sent the push; it says nothing about which table
    // the payload may touch. Users must not be reachable this way.
    const [res] = await sync.push([
      {
        id: 'cccccccc-0000-0000-0000-000000000001',
        type: 'ENTITY_UPSERT',
        payload: {
          entity: 'User',
          id: '33333333-3333-3333-3333-333333333333',
          data: { username: 'attacker', role: 'SUPERUSER' },
        },
      },
    ]);
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/not mirrored/i);
  });

  it('rejects a malformed payload rather than half-applying it', async () => {
    const [res] = await sync.push([
      {
        id: 'dddddddd-0000-0000-0000-000000000001',
        type: 'ENTITY_UPSERT',
        payload: { entity: 'Customer' },
      },
    ]);
    expect(res.status).toBe('FAILED');
  });

  // ── bootstrap ─────────────────────────────────────────────────────────────

  it('mirrorAll queues every existing row so a fresh cloud can be filled', async () => {
    // Data entered BEFORE a cloud existed — exactly the case that left a new
    // Supabase project holding only its schema.
    await ds.getRepository(Customer).save([
      ds.getRepository(Customer).create({ name: 'C1' }),
      ds.getRepository(Customer).create({ name: 'C2' }),
    ]);
    await ds.getRepository(Store).save(
      ds.getRepository(Store).create({ name: 'Main' }),
    );
    expect(await queued()).toHaveLength(0); // nothing was queued at the time

    const summary = await sync.mirrorAll();

    expect(summary.queued).toBe(3);
    expect(summary.byEntity).toEqual({ Store: 1, Customer: 2 });
    const events = await queued();
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.type === 'ENTITY_UPSERT')).toBe(true);
    // Stores before customers: the queue is applied in order, and documents
    // must not land before the rows they point at.
    expect(events[0].payload.entity).toBe('Store');
  });
});
