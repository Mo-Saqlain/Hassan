import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Account } from '../accounts/entities/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { PeriodsService } from '../periods/periods.service';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { JournalService } from './journal.service';

describe('JournalService', () => {
  let service: JournalService;
  let periods: PeriodsService;
  let accounts: AccountsService;
  let ds: DataSource;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          inMemoryTypeOrm([
            Account, Sequence, JournalEntry, JournalLine, AccountingPeriod,
          ]),
        ),
        TypeOrmModule.forFeature([
          Account, Sequence, JournalEntry, JournalLine, AccountingPeriod,
        ]),
      ],
      providers: [
        JournalService, AccountsService, SequenceService, PeriodsService,
      ],
    }).compile();
    await module.init();

    service = module.get(JournalService);
    periods = module.get(PeriodsService);
    accounts = module.get(AccountsService);
    ds = module.get(DataSource);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('seeds system accounts on init (REVENUE, COGS, INVENTORY, A_R, A_P, CASH_ON_HAND)', async () => {
    const revenue = await accounts.findSystem('REVENUE');
    const cogs = await accounts.findSystem('COGS');
    const inv = await accounts.findSystem('INVENTORY');
    const ar = await accounts.findSystem('A_R');
    const ap = await accounts.findSystem('A_P');
    const cashOnHand = await accounts.findSystem('CASH_ON_HAND');
    expect(revenue.accountCategory).toBe('INCOME');
    expect(cogs.accountCategory).toBe('EXPENSE');
    expect(inv.accountCategory).toBe('ASSET');
    expect(ar.accountCategory).toBe('ASSET');
    expect(ap.accountCategory).toBe('LIABILITY');
    expect(cashOnHand.accountCategory).toBe('ASSET');
    [revenue, cogs, inv, ar, ap, cashOnHand].forEach((a) => expect(a.isSystem).toBe(true));
  });

  it('posts a balanced 2-line entry and returns it with its number and lines', async () => {
    const cash = await accounts.findSystem('CASH_ON_HAND');
    const revenue = await accounts.findSystem('REVENUE');
    const entry = await service.post({
      entryDate: new Date('2026-05-15'),
      sourceModule: 'SALE',
      sourceRef: 'INV-000001',
      description: 'Test',
      lines: [
        { accountId: cash.id, debit: 100 },
        { accountId: revenue.id, credit: 100 },
      ],
    });
    expect(entry.entryNumber).toMatch(/^JE-\d{6}$/);
    expect(entry.lines).toHaveLength(2);
    expect(Number(entry.lines[0].debit)).toBe(100);
    expect(Number(entry.lines[1].credit)).toBe(100);
  });

  it('rejects an unbalanced entry', async () => {
    const cash = await accounts.findSystem('CASH_ON_HAND');
    const revenue = await accounts.findSystem('REVENUE');
    await expect(
      service.post({
        entryDate: new Date(),
        sourceModule: 'ADJUSTMENT',
        lines: [
          { accountId: cash.id, debit: 100 },
          { accountId: revenue.id, credit: 50 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a single-sided line (both Dr and Cr on same row)', async () => {
    const cash = await accounts.findSystem('CASH_ON_HAND');
    const revenue = await accounts.findSystem('REVENUE');
    await expect(
      service.post({
        entryDate: new Date(),
        sourceModule: 'ADJUSTMENT',
        lines: [
          { accountId: cash.id, debit: 100, credit: 100 },
          { accountId: revenue.id, credit: 0 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects fewer than two lines', async () => {
    const cash = await accounts.findSystem('CASH_ON_HAND');
    await expect(
      service.post({
        entryDate: new Date(),
        sourceModule: 'ADJUSTMENT',
        lines: [{ accountId: cash.id, debit: 100 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a post into a HARD_CLOSED period', async () => {
    const cash = await accounts.findSystem('CASH_ON_HAND');
    const revenue = await accounts.findSystem('REVENUE');
    const period = await periods.create({
      name: 'Apr 2026',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
    await periods.hardClose(period.id, { reason: 'year-end' });
    await expect(
      service.post({
        entryDate: new Date('2026-04-15'),
        sourceModule: 'ADJUSTMENT',
        lines: [
          { accountId: cash.id, debit: 100 },
          { accountId: revenue.id, credit: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ALLOWS a post into a SOFT_CLOSED period (UI is expected to warn)', async () => {
    const cash = await accounts.findSystem('CASH_ON_HAND');
    const revenue = await accounts.findSystem('REVENUE');
    const period = await periods.create({
      name: 'Mar 2026',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
    await periods.softClose(period.id, { reason: 'month-end' });
    const entry = await service.post({
      entryDate: new Date('2026-03-15'),
      sourceModule: 'ADJUSTMENT',
      lines: [
        { accountId: cash.id, debit: 50 },
        { accountId: revenue.id, credit: 50 },
      ],
    });
    expect(entry.entryNumber).toMatch(/^JE-\d{6}$/);
  });

  it('reverse() flips the signs and links via reversesJournalEntryId', async () => {
    const cash = await accounts.findSystem('CASH_ON_HAND');
    const revenue = await accounts.findSystem('REVENUE');
    const orig = await service.post({
      entryDate: new Date(),
      sourceModule: 'SALE',
      sourceRef: 'INV-000002',
      lines: [
        { accountId: cash.id, debit: 200, narration: 'cash receipt' },
        { accountId: revenue.id, credit: 200, narration: 'sale revenue' },
      ],
    });
    const reversal = await service.reverse(orig.id, {
      reason: 'customer refund',
    });
    expect(reversal.reversesJournalEntryId).toBe(orig.id);
    expect(reversal.lines).toHaveLength(2);
    const cashLine = reversal.lines.find((l) => l.accountId === cash.id);
    const revLine = reversal.lines.find((l) => l.accountId === revenue.id);
    expect(Number(cashLine?.credit)).toBe(200);
    expect(Number(cashLine?.debit)).toBe(0);
    expect(Number(revLine?.debit)).toBe(200);
    expect(Number(revLine?.credit)).toBe(0);
  });

  it('reverse() is idempotent — calling twice returns the same reversal', async () => {
    const cash = await accounts.findSystem('CASH_ON_HAND');
    const revenue = await accounts.findSystem('REVENUE');
    const orig = await service.post({
      entryDate: new Date(),
      sourceModule: 'SALE',
      sourceRef: 'INV-000003',
      lines: [
        { accountId: cash.id, debit: 75 },
        { accountId: revenue.id, credit: 75 },
      ],
    });
    const first = await service.reverse(orig.id, { reason: 'r1' });
    const second = await service.reverse(orig.id, { reason: 'r2 — ignored' });
    expect(second.id).toBe(first.id);
  });
});
