import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import {
  AccountingPeriod,
  PeriodStatus,
} from './entities/accounting-period.entity';
import { CreatePeriodDto } from './dto/create-period.dto';
import { ClosePeriodDto } from './dto/close-period.dto';

/**
 * Periods govern the journal write paths via `assertOpen(date)`. The default
 * stance for a fresh install is "every date is OPEN" — periods only start
 * closing the books once the owner creates them.
 */
@Injectable()
export class PeriodsService {
  constructor(
    @InjectRepository(AccountingPeriod)
    private readonly repo: Repository<AccountingPeriod>,
  ) {}

  async create(dto: CreatePeriodDto): Promise<AccountingPeriod> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) {
      throw new BadRequestException('endDate must be ≥ startDate');
    }
    // Reject overlap with an existing period.
    const overlap = await this.repo.findOne({
      where: {
        startDate: LessThanOrEqual(end),
        endDate: MoreThanOrEqual(start),
      },
    });
    if (overlap) {
      throw new BadRequestException(
        `Period overlaps existing "${overlap.name}" (${this.fmt(overlap.startDate)} – ${this.fmt(overlap.endDate)}).`,
      );
    }
    return this.repo.save(
      this.repo.create({
        name: dto.name,
        startDate: start,
        endDate: end,
        status: 'OPEN',
      }),
    );
  }

  findAll() {
    return this.repo.find({ order: { startDate: 'DESC' } });
  }

  async findOne(id: string) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Period ${id} not found`);
    return p;
  }

  async softClose(id: string, dto: ClosePeriodDto): Promise<AccountingPeriod> {
    const p = await this.findOne(id);
    if (p.status === 'HARD_CLOSED') {
      throw new BadRequestException(
        `Cannot soft-close "${p.name}": already HARD_CLOSED.`,
      );
    }
    p.status = 'SOFT_CLOSED';
    p.closedAt = new Date();
    p.closedBy = dto.userId;
    p.closeReason = dto.reason ?? undefined;
    return this.repo.save(p);
  }

  async hardClose(id: string, dto: ClosePeriodDto): Promise<AccountingPeriod> {
    const p = await this.findOne(id);
    p.status = 'HARD_CLOSED';
    p.closedAt = new Date();
    p.closedBy = dto.userId;
    p.closeReason = dto.reason ?? undefined;
    return this.repo.save(p);
  }

  async reopen(id: string, dto: ClosePeriodDto): Promise<AccountingPeriod> {
    const p = await this.findOne(id);
    p.status = 'OPEN';
    p.closedAt = undefined;
    p.closedBy = dto.userId; // record who reopened
    p.closeReason = dto.reason ?? undefined;
    return this.repo.save(p);
  }

  /**
   * Throws if `date` falls inside a HARD_CLOSED period. Returns silently
   * otherwise (OPEN and SOFT_CLOSED both allow writes — SOFT_CLOSED warning
   * is the UI's responsibility).
   */
  async assertOpen(date: Date): Promise<void> {
    const covering = await this.findCovering(date);
    if (covering?.status === 'HARD_CLOSED') {
      throw new BadRequestException(
        `Cannot post: ${this.fmt(date)} is inside HARD_CLOSED period "${covering.name}" (${this.fmt(covering.startDate)} – ${this.fmt(covering.endDate)}).`,
      );
    }
  }

  /**
   * Returns the period whose [startDate, endDate] covers the given date, or
   * `null` if none — which means "no period set up, this date is implicitly
   * open."
   */
  findCovering(date: Date) {
    return this.repo.findOne({
      where: {
        startDate: LessThanOrEqual(date),
        endDate: MoreThanOrEqual(date),
      },
    });
  }

  private fmt(d: Date): string {
    return new Date(d).toISOString().slice(0, 10);
  }
}
