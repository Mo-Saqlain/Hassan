import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, Repository } from 'typeorm';
import { FundTransfer } from './entities/fund-transfer.entity';
import { CreateFundTransferDto } from './dto/create-fund-transfer.dto';

@Injectable()
export class FundTransfersService {
  constructor(
    @InjectRepository(FundTransfer)
    private readonly repo: Repository<FundTransfer>,
  ) {}

  async create(dto: CreateFundTransferDto): Promise<FundTransfer> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException(
        'Source and destination accounts must differ',
      );
    }
    const transferNo = dto.transferNo ?? (await this.nextTransferNo());
    const transferDate = dto.transferDate ?? today();
    return this.repo.save(
      this.repo.create({ ...dto, transferNo, transferDate }),
    );
  }

  private async nextTransferNo(): Promise<string> {
    const count = await this.repo.count();
    return `TRF-${(count + 1).toString().padStart(6, '0')}`;
  }

  findAll(from?: string, to?: string) {
    const where =
      from && to ? { transferDate: Between(from, to) } : {};
    return this.repo.find({
      where,
      order: { transferDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Fund transfer ${id} not found`);
    return t;
  }

  async remove(id: string) {
    const t = await this.findOne(id);
    await this.repo.remove(t);
    return { deleted: true, id };
  }

  /**
   * Net change to an account's balance from transfers ≤ asOf.
   * +amount when this account received, -amount when it sent.
   */
  async accountDeltaAt(accountId: string, asOf?: Date): Promise<number> {
    const baseQb = (dir: 'from' | 'to') => {
      const qb = this.repo
        .createQueryBuilder('t')
        .where(`t.${dir}_account_id = :id`, { id: accountId })
        .select('COALESCE(SUM(t.amount), 0)', 'sum');
      if (asOf) qb.andWhere('t.created_at <= :asOf', { asOf });
      return qb;
    };
    const [outRow, inRow] = await Promise.all([
      baseQb('from').getRawOne(),
      baseQb('to').getRawOne(),
    ]);
    return Number(inRow?.sum ?? 0) - Number(outRow?.sum ?? 0);
  }

  /**
   * Net change across a set of accounts (CASH, BANK, ...). Used by
   * cash-flow/balance-sheet reports so they can include treasury
   * movements without double-counting them as receipts/payments.
   */
  async groupDeltaAt(accountIds: string[], asOf?: Date): Promise<number> {
    if (accountIds.length === 0) return 0;
    const baseQb = (dir: 'from' | 'to') => {
      const qb = this.repo
        .createQueryBuilder('t')
        .where(`t.${dir}_account_id IN (:...ids)`, { ids: accountIds })
        .select('COALESCE(SUM(t.amount), 0)', 'sum');
      if (asOf) qb.andWhere('t.created_at <= :asOf', { asOf });
      return qb;
    };
    const [outRow, inRow] = await Promise.all([
      baseQb('from').getRawOne(),
      baseQb('to').getRawOne(),
    ]);
    return Number(inRow?.sum ?? 0) - Number(outRow?.sum ?? 0);
  }

  /**
   * Net change per account from every transfer, grouped in one round-trip.
   * Returns a Map keyed by accountId. Used by report endpoints that need a
   * one-shot balance for every account at once (no N+1).
   */
  async deltaByAccount(asOf?: Date): Promise<Map<string, number>> {
    const baseQb = (dir: 'from' | 'to') => {
      const qb = this.repo
        .createQueryBuilder('t')
        .select(`t.${dir}_account_id`, 'aid')
        .addSelect('COALESCE(SUM(t.amount), 0)', 'sum')
        .groupBy(`t.${dir}_account_id`);
      if (asOf) qb.andWhere('t.created_at <= :asOf', { asOf });
      return qb;
    };
    const [ins, outs] = await Promise.all([
      baseQb('to').getRawMany(),
      baseQb('from').getRawMany(),
    ]);
    const map = new Map<string, number>();
    for (const r of ins) map.set(r.aid, Number(r.sum));
    for (const r of outs) map.set(r.aid, (map.get(r.aid) ?? 0) - Number(r.sum));
    return map;
  }

  /** Transfers entirely within a date range that touched any of these accounts. */
  async findInvolvingAccounts(accountIds: string[], from: Date, to: Date) {
    if (accountIds.length === 0) return [];
    return this.repo
      .createQueryBuilder('t')
      .where('t.created_at BETWEEN :from AND :to', { from, to })
      .andWhere(
        '(t.from_account_id IN (:...ids) OR t.to_account_id IN (:...ids))',
        { ids: accountIds },
      )
      .leftJoinAndSelect('t.fromAccount', 'fa')
      .leftJoinAndSelect('t.toAccount', 'ta')
      .orderBy('t.created_at', 'ASC')
      .getMany();
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
