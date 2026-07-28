import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { Customer } from '../customers/entities/customer.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Account } from '../accounts/entities/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import { Sequence } from '../sequences/entities/sequence.entity';
import { SequenceService } from '../sequences/sequence.service';
import { JournalEntry } from '../journals/entities/journal-entry.entity';
import { JournalLine } from '../journals/entities/journal-line.entity';
import { JournalService } from '../journals/journal.service';
import { AccountingPeriod } from '../periods/entities/accounting-period.entity';
import { PeriodsService } from '../periods/periods.service';

/**
 * Editing a payment is the correction accountants reach for most: wrong amount,
 * wrong party, money taken from the wrong till. A payment holds no stock and no
 * lines, so the whole risk is in the journal — the old entry must be balanced
 * out and a new one posted, or the ledger keeps both.
 */
describe('PaymentsService — editing', () => {
  let service: PaymentsService;
  let ds: DataSource;
  let cashId: string;
  let bankId: string;
  let customerId: string;
  let supplierId: string;

  const ENTITIES = [
    Payment, Customer, Supplier, Account, Sequence, JournalEntry, JournalLine,
    AccountingPeriod,
  ];

  /** Net movement on an account across every live journal line. */
  const accountNet = async (accountId: string) => {
    const lines = await ds
      .getRepository(JournalLine)
      .find({ where: { accountId } });
    return lines.reduce(
      (sum, l) => sum + Number(l.debit ?? 0) - Number(l.credit ?? 0),
      0,
    );
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm(ENTITIES)),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      providers: [
        PaymentsService, SequenceService, AccountsService, JournalService,
        PeriodsService,
      ],
    }).compile();
    await moduleRef.init();

    service = moduleRef.get(PaymentsService);
    ds = moduleRef.get(DataSource);

    const accRepo = ds.getRepository(Account);
    cashId = (await accRepo.save(accRepo.create({ name: 'Till', type: 'CASH' }))).id;
    bankId = (await accRepo.save(accRepo.create({ name: 'Bank', type: 'BANK' }))).id;
    customerId = (
      await ds.getRepository(Customer).save(
        ds.getRepository(Customer).create({ name: 'C1' }),
      )
    ).id;
    supplierId = (
      await ds.getRepository(Supplier).save(
        ds.getRepository(Supplier).create({ name: 'S1' }),
      )
    ).id;
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('corrects the amount and leaves the ledger showing only the new figure', async () => {
    const rct = await service.create({
      direction: 'IN', accountId: cashId, customerId, amount: 5000,
    });
    expect(await accountNet(cashId)).toBe(5000);

    const edited = await service.edit(
      rct.id,
      { direction: 'IN', accountId: cashId, customerId, amount: 4500 },
      { reason: 'counted 4500, not 5000' },
    );

    expect(edited.id).toBe(rct.id);
    expect(edited.voucherNo).toBe(rct.voucherNo); // same voucher
    expect(Number(edited.amount)).toBe(4500);
    // 5000 in, 5000 back out on the reversal, 4500 in again.
    expect(await accountNet(cashId)).toBe(4500);
    expect(edited.editCount).toBe(1);
  });

  it('can move the money to a different account', async () => {
    const rct = await service.create({
      direction: 'IN', accountId: cashId, customerId, amount: 3000,
    });

    await service.edit(
      rct.id,
      { direction: 'IN', accountId: bankId, customerId, amount: 3000 },
      { reason: 'went into the bank, not the till' },
    );

    expect(await accountNet(cashId)).toBe(0);
    expect(await accountNet(bankId)).toBe(3000);
  });

  it('can repoint a supplier payment to a different supplier', async () => {
    const other = await ds.getRepository(Supplier).save(
      ds.getRepository(Supplier).create({ name: 'S2' }),
    );
    const pmt = await service.create({
      direction: 'OUT', accountId: cashId, supplierId, amount: 2000,
    });

    const edited = await service.edit(
      pmt.id,
      { direction: 'OUT', accountId: cashId, supplierId: other.id, amount: 2000 },
      { reason: 'paid the wrong supplier' },
    );

    // The FK must actually change — a stale eager relation would silently win.
    expect(edited.supplierId).toBe(other.id);
  });

  it('applies create-time validation to the corrected voucher', async () => {
    const rct = await service.create({
      direction: 'IN', accountId: cashId, customerId, amount: 1000,
    });

    // A receipt without a customer is not a voucher create would accept.
    await expect(
      service.edit(
        rct.id,
        { direction: 'IN', accountId: cashId, amount: 1000 } as any,
        { reason: 'drop the customer' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason, refuses a reversed voucher and an instalment settlement', async () => {
    const rct = await service.create({
      direction: 'IN', accountId: cashId, customerId, amount: 1000,
    });
    await expect(
      service.edit(
        rct.id,
        { direction: 'IN', accountId: cashId, customerId, amount: 900 },
        { reason: '   ' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.reverse(rct.id, { reason: 'voided' });
    await expect(
      service.edit(
        rct.id,
        { direction: 'IN', accountId: cashId, customerId, amount: 900 },
        { reason: 'too late' },
      ),
    ).rejects.toThrow(/reversed/i);

    // A settlement receipt belongs to a sale's commitment schedule.
    const settlement = await ds.getRepository(Payment).save(
      ds.getRepository(Payment).create({
        voucherNo: 'RCT-SETTLE-1', direction: 'IN', accountId: cashId,
        customerId, amount: 500, referenceType: 'SALE_COMMITMENT',
        referenceId: '11111111-1111-1111-1111-111111111111',
      }),
    );
    await expect(
      service.edit(
        settlement.id,
        { direction: 'IN', accountId: cashId, customerId, amount: 600 },
        { reason: 'bump it' },
      ),
    ).rejects.toThrow(/instalment/i);
  });

  it('stays correct across two edits — no double-counting', async () => {
    const rct = await service.create({
      direction: 'IN', accountId: cashId, customerId, amount: 1000,
    });
    await service.edit(
      rct.id,
      { direction: 'IN', accountId: cashId, customerId, amount: 2000 },
      { reason: 'first' },
    );
    await service.edit(
      rct.id,
      { direction: 'IN', accountId: cashId, customerId, amount: 3000 },
      { reason: 'second' },
    );

    // Only the latest posting should be live. This is what findActiveBySource
    // exists for: without it the second edit reverses the original again and
    // leaves the first correction standing.
    expect(await accountNet(cashId)).toBe(3000);
    expect((await service.findOne(rct.id)).editCount).toBe(2);
  });
});
