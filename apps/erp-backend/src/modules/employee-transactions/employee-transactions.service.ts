import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  EmployeeTransaction,
  EmployeeTransactionType,
} from './entities/employee-transaction.entity';
import { CreateEmployeeTransactionDto } from './dto/create-employee-transaction.dto';
import { SequenceService } from '../sequences/sequence.service';

/** TYPE → voucher prefix. Each type sequences independently. */
const PREFIX: Record<EmployeeTransactionType, string> = {
  SALARY_ACCRUED: 'SALA',
  SALARY: 'SAL',
  ADVANCE: 'ADV',
  REIMBURSEMENT: 'RBT',
  EXPENSE: 'EXP',
  INCENTIVE_PAYOUT: 'INC',
  ADJUSTMENT: 'ADJ',
};

@Injectable()
export class EmployeeTransactionsService {
  constructor(
    @InjectRepository(EmployeeTransaction)
    private readonly repo: Repository<EmployeeTransaction>,
    private readonly sequences: SequenceService,
  ) {}

  async create(dto: CreateEmployeeTransactionDto): Promise<EmployeeTransaction> {
    const voucherNo = dto.voucherNo ?? (await this.nextVoucherNo(dto.type));
    const transactionDate = dto.transactionDate ?? new Date().toISOString().slice(0, 10);
    return this.repo.save(
      this.repo.create({ ...dto, voucherNo, transactionDate }),
    );
  }

  private async nextVoucherNo(type: EmployeeTransactionType): Promise<string> {
    const prefix = PREFIX[type];
    return this.sequences.next(prefix, () =>
      this.repo.count({ where: { type } }),
    );
  }

  findAll(employeeId?: string, from?: string, to?: string) {
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (from && to) where.transactionDate = Between(from, to);
    return this.repo.find({ where, order: { transactionDate: 'DESC', createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Employee transaction ${id} not found`);
    return t;
  }

  async remove(id: string) {
    const t = await this.findOne(id);
    await this.repo.remove(t);
    return { deleted: true, id };
  }
}
