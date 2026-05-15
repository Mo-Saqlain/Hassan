import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { AccountingPeriod } from './entities/accounting-period.entity';
import { PeriodsService } from './periods.service';

describe('PeriodsService', () => {
  let service: PeriodsService;
  let ds: DataSource;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm([AccountingPeriod])),
        TypeOrmModule.forFeature([AccountingPeriod]),
      ],
      providers: [PeriodsService],
    }).compile();

    service = module.get(PeriodsService);
    ds = module.get(DataSource);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('creates an OPEN period with start <= end', async () => {
    const p = await service.create({
      name: 'May 2026',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    expect(p.status).toBe('OPEN');
    expect(p.name).toBe('May 2026');
  });

  it('rejects a period whose end is before start', async () => {
    await expect(
      service.create({
        name: 'bad',
        startDate: '2026-05-31',
        endDate: '2026-05-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an overlapping period', async () => {
    await service.create({
      name: 'May 2026',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    await expect(
      service.create({
        name: 'overlapping',
        startDate: '2026-05-15',
        endDate: '2026-06-15',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft-close transitions to SOFT_CLOSED and assertOpen still passes', async () => {
    const p = await service.create({
      name: 'May 2026',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    await service.softClose(p.id, { reason: 'month-end' });
    await expect(service.assertOpen(new Date('2026-05-15'))).resolves.toBeUndefined();
  });

  it('hard-close transitions to HARD_CLOSED and assertOpen throws', async () => {
    const p = await service.create({
      name: 'May 2026',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    await service.hardClose(p.id, { reason: 'year-end' });
    await expect(service.assertOpen(new Date('2026-05-15'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('hard-close → reopen restores OPEN status', async () => {
    const p = await service.create({
      name: 'May 2026',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    await service.hardClose(p.id, { reason: 'wrong' });
    const reopened = await service.reopen(p.id, { reason: 'unintentional close' });
    expect(reopened.status).toBe('OPEN');
    await expect(service.assertOpen(new Date('2026-05-15'))).resolves.toBeUndefined();
  });

  it('cannot soft-close a HARD_CLOSED period', async () => {
    const p = await service.create({
      name: 'May 2026',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    await service.hardClose(p.id, { reason: 'final' });
    await expect(
      service.softClose(p.id, { reason: 'try downgrade' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assertOpen with no covering period is a no-op (date is implicitly open)', async () => {
    await expect(service.assertOpen(new Date('2030-01-01'))).resolves.toBeUndefined();
  });

  it('findOne returns 404 for unknown id', async () => {
    await expect(service.findOne('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
