import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { SyncEvent } from './entities/sync-event.entity';
import { SyncQueueEntry } from '../outbox/entities/sync-queue.entity';
import { OutboxService } from '../outbox/outbox.service';
import { SyncService } from './sync.service';
import { SalesService } from '../sales/sales.service';
import { PurchasesService } from '../purchases/purchases.service';

describe('SyncService', () => {
  let service: SyncService;
  let salesMock: { create: jest.Mock };
  let purchasesMock: { create: jest.Mock };
  let ds: DataSource;

  beforeEach(async () => {
    salesMock = {
      create: jest.fn().mockResolvedValue({ id: 'sale-id-1' }),
    };
    purchasesMock = {
      create: jest.fn().mockResolvedValue({ id: 'purchase-id-1' }),
    };

    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm([SyncEvent, SyncQueueEntry])),
        TypeOrmModule.forFeature([SyncEvent, SyncQueueEntry]),
        ScheduleModule.forRoot(),
      ],
      providers: [
        SyncService,
        OutboxService,
        { provide: SalesService, useValue: salesMock },
        { provide: PurchasesService, useValue: purchasesMock },
      ],
    }).compile();

    service = module.get(SyncService);
    ds = module.get(DataSource);
  });

  afterEach(async () => {
    delete process.env.CLOUD_SYNC_URL;
    await ds.destroy();
  });

  it('processes a new SALE_CREATED event and records it as PROCESSED', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const [result] = await service.push([
      { id, type: 'SALE_CREATED', payload: { lines: [] } },
    ]);
    expect(result.status).toBe('PROCESSED');
    expect(result.resultId).toBe('sale-id-1');
    expect(salesMock.create).toHaveBeenCalledWith(
      { lines: [] }, { skipOutbox: true },
    );
  });

  it('returns DUPLICATE on re-push of the same event id', async () => {
    const id = '22222222-2222-2222-2222-222222222222';
    await service.push([
      { id, type: 'SALE_CREATED', payload: { lines: [] } },
    ]);
    salesMock.create.mockClear();
    const [second] = await service.push([
      { id, type: 'SALE_CREATED', payload: { lines: [] } },
    ]);
    expect(second.status).toBe('DUPLICATE');
    expect(second.resultId).toBe('sale-id-1');
    expect(salesMock.create).not.toHaveBeenCalled();
  });

  it('treats POS_SALE_CREATED like SALE_CREATED and strips sessionId from payload', async () => {
    const id = '33333333-3333-3333-3333-333333333333';
    const [result] = await service.push([
      {
        id,
        type: 'POS_SALE_CREATED',
        payload: { sessionId: 'session-x', lines: [] },
      },
    ]);
    expect(result.status).toBe('PROCESSED');
    expect(salesMock.create).toHaveBeenCalled();
    // The payload handed to SalesService.create should NOT contain sessionId.
    const callArg = salesMock.create.mock.calls[0][0];
    expect(callArg.sessionId).toBeUndefined();
  });

  it('PROCESSES PURCHASE_CREATED via purchases service', async () => {
    const id = '44444444-4444-4444-4444-444444444444';
    const [r] = await service.push([
      { id, type: 'PURCHASE_CREATED', payload: { lines: [] } },
    ]);
    expect(r.status).toBe('PROCESSED');
    expect(purchasesMock.create).toHaveBeenCalled();
  });

  it('records FAILED status when downstream service throws', async () => {
    salesMock.create.mockRejectedValueOnce(new Error('boom'));
    const id = '55555555-5555-5555-5555-555555555555';
    const [r] = await service.push([
      { id, type: 'SALE_CREATED', payload: { lines: [] } },
    ]);
    expect(r.status).toBe('FAILED');
    expect(r.error).toContain('boom');
    const persisted = await ds.getRepository(SyncEvent).findOne({ where: { id } });
    expect(persisted?.status).toBe('FAILED');
  });

  it('records FAILED for unknown event type', async () => {
    const id = '66666666-6666-6666-6666-666666666666';
    const [r] = await service.push([
      { id, type: 'NOPE_CREATED', payload: {} },
    ]);
    expect(r.status).toBe('FAILED');
    expect(r.error).toContain('Unknown sync event type');
  });

  it('POS_SESSION_STARTED / POS_SESSION_CLOSED are acknowledged without DB writes', async () => {
    const [r1] = await service.push([
      {
        id: '77777777-7777-7777-7777-777777777777',
        type: 'POS_SESSION_STARTED',
        payload: { id: 'x' },
      },
    ]);
    expect(r1.status).toBe('PROCESSED');
    expect(salesMock.create).not.toHaveBeenCalled();
  });

  it('pushPending is a no-op when CLOUD_SYNC_URL is not set', async () => {
    // queue an entry first
    const outbox = (service as any).outbox as OutboxService;
    await outbox.enqueue('SALE_CREATED', { lines: [] });
    await service.pushPending(); // should silently return
    expect(await service.pendingCount()).toBe(1);
  });
});
