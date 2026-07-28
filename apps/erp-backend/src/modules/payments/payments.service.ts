import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
    await this.validateShape(dto);
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

      await this.postJournalFor(manager, persisted);

      return persisted;
    });
  }

  /**
   * Shape rules for a voucher, applied by both create and edit so a correction
   * can't produce something create would have refused.
   */
  private async validateShape(dto: CreatePaymentDto) {
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
  }

  /**
   * Post the double entry for a voucher row:
   *   IN  (RCT-…, receipt from customer):        Dr Cash/Bank ; Cr A/R
   *   OUT to supplier (PMT-…, supplier payment): Dr A/P       ; Cr Cash/Bank
   *   OUT to customer (PMT-…, loan / advance):   Dr A/R       ; Cr Cash/Bank
   *   OUT expense    (EXPV-…, shop expense):     Dr Expense   ; Cr Cash/Bank
   *
   * The customer case books the disbursement straight to A/R so the customer
   * now owes us more (a friend loan, or paying back a customer who is in
   * credit). A later Receipt (IN) settles it. The expense case books the cost
   * straight to the operating-expense leaf so it lands on the Income Statement
   * while the paid-from account (till/bank) drops.
   *
   * Shared by create and edit — an edited voucher must post the same way a new
   * one would, including when the edit changes its direction or its party.
   */
  private async postJournalFor(manager: EntityManager, p: Payment) {
    const sysAR = await this.accounts.findSystem('A_R');
    const sysAP = await this.accounts.findSystem('A_P');
    const sysCashFallback = await this.accounts.findSystem('CASH_ON_HAND');
    const cashAccountId = p.accountId ?? sysCashFallback.id;
    const amount = Number(p.amount);
    const voucherNo = p.voucherNo;
    const isCustomerOut = p.direction === 'OUT' && !!p.customerId;
    const isExpenseOut = p.direction === 'OUT' && !!p.expenseAccountId;

    const lines =
      p.direction === 'IN'
        ? [
            { accountId: cashAccountId, debit: amount, narration: `${voucherNo} receipt` },
            { accountId: sysAR.id, credit: amount, narration: `${voucherNo} clears A/R` },
          ]
        : isExpenseOut
          ? [
              { accountId: p.expenseAccountId!, debit: amount, narration: `${voucherNo} expense` },
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
        entryDate: p.createdAt,
        sourceModule: p.direction === 'IN' ? 'RECEIPT' : 'PAYMENT',
        sourceRef: voucherNo,
        description: `${p.direction === 'IN' ? 'Receipt' : 'Payment'} ${voucherNo}`,
        lines,
      },
      manager,
    );
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
   * Correct a receipt / payment / expense voucher in place — same voucher
   * number, same row. Payments post no stock and hold no lines, so the whole
   * job is: balance out the old journal entry, rewrite the row, post a fresh
   * entry. Party, direction, account, amount and expense category are all fair
   * game; the validation the create path applies is applied again, so an edit
   * can't produce a voucher that create would have rejected.
   */
  async edit(
    id: string,
    dto: CreatePaymentDto,
    opts: { reason: string; userId?: string },
  ): Promise<Payment> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('An edit needs a reason.');
    }
    const reason = opts.reason.trim();
    await this.validateShape(dto);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Payment);
      const original = await repo.findOne({ where: { id } });
      if (!original) throw new NotFoundException(`Payment ${id} not found`);

      if (original.reversedAt) {
        throw new BadRequestException(
          `Voucher ${original.voucherNo} is reversed. Enter a new voucher instead of editing this one.`,
        );
      }
      // A settlement receipt was applied against a specific sale's commitment
      // schedule, and that sale's amountPaidSettled was advanced by this exact
      // amount. Editing it here would leave the sale's schedule describing money
      // that no longer matches.
      if (original.referenceType === 'SALE_COMMITMENT') {
        throw new BadRequestException(
          `Voucher ${original.voucherNo} settles an instalment on a sale. Reverse it from the sale instead of editing it here.`,
        );
      }

      const sourceModule = original.direction === 'IN' ? 'RECEIPT' : 'PAYMENT';
      const entry = await this.journals.findActiveBySource(
        sourceModule,
        original.voucherNo,
        manager,
      );
      if (entry) {
        await this.journals.reverse(
          entry.id,
          {
            entryDate: new Date(),
            description: `Reversal of ${original.voucherNo}`,
            reason: `Edit: ${reason}`,
          },
          manager,
        );
      }

      // Keep identity, take everything else from the corrected voucher. The
      // relation objects are cleared so the re-pointed FKs win on save.
      const voucherNo = original.voucherNo;
      Object.assign(original, dto, { voucherNo });
      original.customer = undefined;
      original.supplier = undefined;
      original.account = undefined as unknown as Payment['account'];
      original.expenseAccount = undefined;
      original.editCount = Number(original.editCount ?? 0) + 1;
      original.lastEditedAt = new Date();
      original.lastEditReason = reason;
      const saved = await repo.save(original);

      await this.postJournalFor(manager, saved);

      return saved;
    });
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
      const originalEntry = await this.journals.findActiveBySource(sourceModule, p.voucherNo, manager);
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
