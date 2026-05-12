import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { IncentiveTarget } from './entities/incentive-target.entity';
import { IncentiveAward } from './entities/incentive-award.entity';
import { CreateIncentiveTargetDto } from './dto/create-incentive-target.dto';
import { UpdateIncentiveTargetDto } from './dto/update-incentive-target.dto';
import { CreateIncentiveAwardDto } from './dto/create-incentive-award.dto';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';
import { Item } from '../items/entities/item.entity';

@Injectable()
export class IncentivesService {
  constructor(
    @InjectRepository(IncentiveTarget)
    private readonly targets: Repository<IncentiveTarget>,
    @InjectRepository(IncentiveAward)
    private readonly awards: Repository<IncentiveAward>,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItems: Repository<SaleItem>,
    @InjectRepository(SaleReturn)
    private readonly saleReturns: Repository<SaleReturn>,
    @InjectRepository(SaleReturnItem)
    private readonly saleReturnItems: Repository<SaleReturnItem>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
  ) {}

  // ─── Targets ──────────────────────────────────────────────────────────

  async createTarget(dto: CreateIncentiveTargetDto): Promise<IncentiveTarget> {
    if (dto.basis === 'ITEM' && !dto.itemId) {
      throw new BadRequestException('ITEM-basis target requires itemId');
    }
    if (dto.basis === 'BRAND' && !dto.brandId) {
      throw new BadRequestException('BRAND-basis target requires brandId');
    }
    if (new Date(dto.periodEnd) < new Date(dto.periodStart)) {
      throw new BadRequestException('periodEnd must be on or after periodStart');
    }
    return this.targets.save(this.targets.create(dto));
  }

  findAllTargets() {
    return this.targets.find({ order: { periodStart: 'DESC' } });
  }

  async findTarget(id: string) {
    const t = await this.targets.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Incentive target ${id} not found`);
    return t;
  }

  async updateTarget(id: string, dto: UpdateIncentiveTargetDto) {
    const t = await this.findTarget(id);
    Object.assign(t, dto);
    return this.targets.save(t);
  }

  async removeTarget(id: string) {
    const t = await this.findTarget(id);
    await this.targets.remove(t);
    return { deleted: true, id };
  }

  /**
   * Progress for a single target — counts sold qty in the target window,
   * subtracts returns, and reports whether the target has been hit.
   */
  async targetProgress(id: string) {
    const t = await this.findTarget(id);
    const start = new Date(`${t.periodStart}T00:00:00.000Z`);
    const end = new Date(`${t.periodEnd}T23:59:59.999Z`);

    let itemIds: string[];
    if (t.basis === 'ITEM') {
      itemIds = [t.itemId!];
    } else {
      const items = await this.items.find({ where: { brandId: t.brandId } });
      itemIds = items.map((i) => i.id);
    }

    if (itemIds.length === 0) {
      return this.buildProgress(t, 0, 0);
    }

    const soldRow = await this.saleItems
      .createQueryBuilder('sl')
      .innerJoin('sl.sale', 's')
      .where('sl.item_id IN (:...ids)', { ids: itemIds })
      .andWhere('s.created_at BETWEEN :start AND :end', { start, end })
      .select('COALESCE(SUM(sl.quantity), 0)', 'qty')
      .getRawOne();
    const returnedRow = await this.saleReturnItems
      .createQueryBuilder('rl')
      .innerJoin('rl.saleReturn', 'r')
      .where('rl.item_id IN (:...ids)', { ids: itemIds })
      .andWhere('r.created_at BETWEEN :start AND :end', { start, end })
      .select('COALESCE(SUM(rl.quantity), 0)', 'qty')
      .getRawOne();

    const sold = Number(soldRow?.qty ?? 0);
    const returned = Number(returnedRow?.qty ?? 0);
    return this.buildProgress(t, sold, returned);
  }

  async allTargetProgress() {
    const list = await this.targets.find({ order: { periodEnd: 'ASC' } });
    return Promise.all(list.map((t) => this.targetProgress(t.id)));
  }

  private buildProgress(t: IncentiveTarget, sold: number, returned: number) {
    const net = Math.max(0, sold - returned);
    const target = Number(t.targetQuantity);
    const achieved = net >= target;
    const progressPct =
      target === 0 ? 0 : Math.min(100, (net / target) * 100);
    return {
      target: t,
      soldQuantity: sold,
      returnedQuantity: returned,
      netQuantity: net,
      targetQuantity: target,
      remaining: Math.max(0, target - net),
      progressPct: Number(progressPct.toFixed(2)),
      achieved,
      potentialIncentive: Number(t.incentiveAmount),
    };
  }

  // ─── Awards ──────────────────────────────────────────────────────────

  async createAward(dto: CreateIncentiveAwardDto): Promise<IncentiveAward> {
    if (dto.targetId) {
      await this.findTarget(dto.targetId);
    }
    return this.awards.save(this.awards.create(dto));
  }

  findAllAwards(from?: string, to?: string) {
    const where =
      from && to
        ? { awardedOn: Between(from, to) }
        : {};
    return this.awards.find({ where, order: { awardedOn: 'DESC' } });
  }

  async findAward(id: string) {
    const a = await this.awards.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Incentive award ${id} not found`);
    return a;
  }

  async removeAward(id: string) {
    const a = await this.findAward(id);
    await this.awards.remove(a);
    return { deleted: true, id };
  }

  /**
   * Sum of awards in the period — consumed by ReportsService to compute
   * adjusted net income that includes incentives on top of gross margin.
   */
  async awardsTotal(from?: string, to?: string): Promise<number> {
    const qb = this.awards
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.amount), 0)', 'sum');
    if (from) qb.andWhere('a.awarded_on >= :from', { from });
    if (to) qb.andWhere('a.awarded_on <= :to', { to });
    const row = await qb.getRawOne();
    return Number(row?.sum ?? 0);
  }
}
