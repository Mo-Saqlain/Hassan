import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Sequence } from './entities/sequence.entity';
import { SequenceService } from './sequence.service';

describe('SequenceService', () => {
  let service: SequenceService;
  let ds: DataSource;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm([Sequence])),
        TypeOrmModule.forFeature([Sequence]),
      ],
      providers: [SequenceService],
    }).compile();

    service = module.get(SequenceService);
    ds = module.get(DataSource);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('returns INV-000001 for the first call when no seed is provided', async () => {
    const v = await service.next('INV');
    expect(v).toBe('INV-000001');
  });

  it('formats with 6-digit zero padding', async () => {
    const v = await service.next('PMT');
    expect(v).toMatch(/^PMT-\d{6}$/);
  });

  it('seeds from existing max + 1 on first call when seedFromMax is provided', async () => {
    const v = await service.next('INV', async () => 123);
    expect(v).toBe('INV-000124');
  });

  it('ignores seedFromMax on subsequent calls (row already exists)', async () => {
    await service.next('INV', async () => 123);
    // Even if the caller passes a smaller seed now, the sequence keeps
    // advancing from where it left off.
    const v = await service.next('INV', async () => 5);
    expect(v).toBe('INV-000125');
  });

  it('different prefixes have independent counters', async () => {
    expect(await service.next('INV')).toBe('INV-000001');
    expect(await service.next('BILL')).toBe('BILL-000001');
    expect(await service.next('INV')).toBe('INV-000002');
    expect(await service.next('BILL')).toBe('BILL-000002');
  });

  it('serial sequential calls produce distinct contiguous values', async () => {
    const values: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      values.push(await service.next('PO'));
    }
    expect(new Set(values).size).toBe(20);
    expect(values[0]).toBe('PO-000001');
    expect(values[19]).toBe('PO-000020');
  });

  // Concurrent-allocation safety (Promise.all of N calls) is only
  // exercisable on Postgres because better-sqlite3 is single-writer per
  // connection and rejects nested transactions with
  // "cannot start a transaction within a transaction". The serial-sequential
  // test above demonstrates the contract (distinct, monotonic) within the
  // single-writer constraint that holds in the Electron desktop install.
  // Production concurrency relies on Postgres's SELECT … FOR UPDATE; see
  // SequenceService.next() where the lock is conditionally applied by
  // dialect.
});
