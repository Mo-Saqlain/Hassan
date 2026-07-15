import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SequenceService } from '../sequences/sequence.service';
import { DataSource } from 'typeorm';
import { JournalService } from '../journals/journal.service';
import { AccountsService } from '../accounts/accounts.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly repo: Repository<Payment>,
    private readonly sequences: SequenceService,
    private readonly dataSource: DataSource,
    private readonly journals: JournalService,
    private readonly accounts: AccountsService,
  ) {}

  async create(dto: CreatePaymentDto): Promise<Payment> {
    if (dto.direction === 'IN' && !dto.customerId) {
      throw new BadRequestException('Receipt voucher requires customerId');
    }
    if (
      dto.direction === 'OUT' &&
      !dto.supplierId &&
      !dto.customerId &&
      !dto.expenseAccountId
    ) {
      throw new BadRequestException(
        'Payment voucher requires a supplierId (supplier payment), a customerId (loan / advance to a customer), or an expenseAccountId (shop expense)',
      );
    }
    if (dto.expenseAccountId) {
      if (dto.direction !== 'OUT') {
        throw new BadRequestException('An expense must be an OUT voucher');
      }
      if (dto.supplierId || dto.customerId) {
        throw new BadRequestException(
          'An expense voucher cannot also target a supplier or customer',
        );
      }
      const expenseAcct = await this.accounts.findOne(dto.expenseAccountId);
      if (expenseAcct.accountCategory !== 'EXPENSE') {
        throw new BadRequestException(
          `Account ${expenseAcct.name} is not an expense account`,
        );
      }
      if (expenseAcct.isControl) {
        throw new BadRequestException(
          'Pick a specific expense category, not the Operating Expenses group',
        );
      }
    }
    // Expense vouchers get their own EXPV series (EXP is already the employee
    // out-of-pocket-expense prefix — keep the two counters separate).
    const voucherNo =
      dto.voucherNo ??
      (dto.expenseAccountId
        ? await this.sequences.next('EXPV', () =>
            this.repo.count({ where: { direction: 'OUT' } }),
          )
        : await this.nextVoucherNo(dto.direction));

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Payment);
      const persisted = await repo.save(repo.create({ ...dto, voucherNo }));

      // Journal posting:
      //   IN  (RCT-…, receipt from customer):        Dr Cash/Bank ; Cr A/R
      //   OUT to supplier (PMT-…, supplier payment): Dr A/P       ; Cr Cash/Bank
      //   OUT to customer (PMT-…, loan / advance):   Dr A/R       ; Cr Cash/Bank
      //   OUT expense    (EXPV-…, shop expense):     Dr Expense   ; Cr Cash/Bank
      // The customer case books the disbursement straight to A/R so the
      // customer now owes us more (a friend loan, or paying back a customer
      // who is in credit). A later Receipt (IN) settles it. The expense case
      // books the cost straight to the operating-expense leaf so it lands on
      // the Income Statement while the paid-from account (till/bank) drops.
      const sysAR = await this.accounts.findSystem('A_R');
      const sysAP = await this.accounts.findSystem('A_P');
      const sysCashFallback = await this.accounts.findSystem('CASH_ON_HAND');
      const cashAccountId = dto.accountId ?? sysCashFallback.id;
      const amount = Number(dto.amount);
      const isCustomerOut = dto.direction === 'OUT' && !!dto.customerId;
      const isExpenseOut = dto.direction === 'OUT' && !!dto.expenseAccountId;

      const lines =
        dto.direction === 'IN'
          ? [
              { accountId: cashAccountId, debit: amount, narration: `${voucherNo} receipt` },
              { accountId: sysAR.id, credit: amount, narration: `${voucherNo} clears A/R` },
            ]
          : isExpenseOut
            ? [
                { accountId: dto.expenseAccountId!, debit: amount, narration: `${voucherNo} expense` },
                { accountId: cashAccountId, credit: amount, narration: `${voucherNo} paid` },
              ]
            : isCustomerOut
              ? [
                  { accountId: sysAR.id, debit: amount, narration: `${voucherNo} loan/advance to customer` },
                  { accountId: cashAccountId, credit: amount, narration: `${voucherNo} payment` },
                ]
              : [
                  { accountId: sysAP.id, debit: amount, narration: `${voucherNo} clears A/P` },
                  { accountId: cashAccountId, credit: amount, narration: `${voucherNo} payment` },
                ];

      await this.journals.post(
        {
          entryDate: persisted.createdAt,
          sourceModule: dto.direction === 'IN' ? 'RECEIPT' : 'PAYMENT',
          sourceRef: voucherNo,
          description: `${dto.direction === 'IN' ? 'Receipt' : 'Payment'} ${voucherNo}`,
          lines,
        },
        manager,
      );

      return persisted;
    });
  }

  private async nextVoucherNo(direction: 'IN' | 'OUT') {
    const prefix = direction === 'IN' ? 'RCT' : 'PMT';
    return this.sequences.next(prefix, () =>
      this.repo.count({ where: { direction } }),
    );
  }

  findAll(direction?: 'IN' | 'OUT') {
    return this.repo.find({
      where: direction ? { direction } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Payment ${id} not found`);
    return p;
  }

  /**
   * Reverses a receipt or payment by posting a balancing journal entry and
   * marking the row. No stock impact (payments don't move stock). Idempotent.
   */
  async reverse(
    id: string,
    opts: { userId?: string; reason: string },
  ): Promise<Payment> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('Reversal requires a reason.');
    }
    return this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const p = await paymentRepo.findOne({ where: { id } });
      if (!p) throw new NotFoundException(`Payment ${id} not found`);
      if (p.reversedAt) return p;

      const sourceModule = p.direction === 'IN' ? 'RECEIPT' : 'PAYMENT';
      const originalEntry = await this.journals.findBySource(sourceModule, p.voucherNo);
      if (originalEntry) {
        await this.journals.reverse(
          originalEntry.id,
          {
            entryDate: new Date(),
            description: `Reversal of ${sourceModule.toLowerCase()} ${p.voucherNo}`,
            reason: opts.reason,
          },
          manager,
        );
      }

      p.reversedAt = new Date();
      p.reversedBy = opts.userId;
      p.reversalReason = opts.reason;
      return paymentRepo.save(p);
    });
  }
}
