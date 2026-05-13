import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { EmployeeIncentiveRule } from './entities/employee-incentive-rule.entity';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Item } from '../items/entities/item.entity';
import { SaleReturn } from '../returns/entities/sale-return.entity';
import { SaleReturnItem } from '../returns/entities/sale-return-item.entity';

export interface CalcRow {
  employeeId: string;
  employeeName: string;
  ruleId: string;
  basis: string;
  saleId: string;
  invoiceNo: string;
  saleDate: Date;
  itemName?: string;
  baseAmount: number; // sale line amount the percentage was applied to
  percentage: number;
  amount: number;
}

@Injectable()
export class EmployeeIncentivesService {
  constructor(
    @InjectRepository(EmployeeIncentiveRule)
    private readonly rules: Repository<EmployeeIncentiveRule>,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItems: Repository<SaleItem>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(SaleReturn)
    private readonly saleReturns: Repository<SaleReturn>,
    @InjectRepository(SaleReturnItem)
    private readonly saleReturnItems: Repository<SaleReturnItem>,
  ) {}

  // ─── Rules CRUD ─────────────────────────────────────────────────

  async createRule(dto: CreateRuleDto): Promise<EmployeeIncentiveRule> {
    if (dto.basis !== 'ALL_SALES' && !dto.referenceId) {
      throw new BadRequestException(
        `${dto.basis} rule requires referenceId pointing at a ${dto.basis.toLowerCase()}`,
      );
    }
    if (dto.basis === 'ALL_SALES' && dto.referenceId) {
      throw new BadRequestException(
        `ALL_SALES rule must not have a referenceId`,
      );
    }
    return this.rules.save(this.rules.create(dto));
  }

  findAllRules(employeeId?: string) {
    return this.rules.find({
      where: employeeId ? { employeeId } : {},
      order: { isActive: 'DESC', createdAt: 'DESC' },
    });
  }

  async findRule(id: string) {
    const r = await this.rules.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Rule ${id} not found`);
    return r;
  }

  async updateRule(id: string, dto: UpdateRuleDto) {
    const r = await this.findRule(id);
    Object.assign(r, dto);
    return this.rules.save(r);
  }

  async removeRule(id: string) {
    const r = await this.findRule(id);
    await this.rules.remove(r);
    return { deleted: true, id };
  }

  // ─── Calculation ─────────────────────────────────────────────

  /**
   * Walk every sale in the period, match it against every active rule, and
   * emit one ledger row per (sale_line × matching rule). Returns rows
   * suitable for the employee ledger and a total grouped by employee.
   *
   * Sale returns reduce the base amount for any rule that referenced the
   * returned item — so an employee whose Rs.10000 sale gets returned for
   * Rs.4000 sees their commission drop accordingly.
   */
  async computeForPeriod(
    from: string,
    to: string,
    employeeId?: string,
  ): Promise<{ rows: CalcRow[]; byEmployee: Record<string, number>; total: number }> {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const ruleWhere: any = { isActive: true };
    if (employeeId) ruleWhere.employeeId = employeeId;

    // Run the four independent reads (rules, sales+lines on period, returns
    // on period, items) concurrently. Previously every step waited for the
    // prior, which over the network was the dominant cost.
    const [rules, sales, returns, items] = await Promise.all([
      this.rules.find({ where: ruleWhere }),
      this.sales.find({ where: { createdAt: Between(fromDate, toDate) } }),
      this.saleReturns.find({ where: { createdAt: Between(fromDate, toDate) } }),
      this.items.find(),
    ]);
    if (rules.length === 0) {
      return { rows: [], byEmployee: {}, total: 0 };
    }
    const saleIds = sales.map((s) => s.id);
    if (saleIds.length === 0) {
      return { rows: [], byEmployee: {}, total: 0 };
    }
    const returnIds = returns.map((r) => r.id);
    const [lines, returnLines] = await Promise.all([
      this.saleItems.find({ where: { saleId: In(saleIds) } }),
      returnIds.length
        ? this.saleReturnItems.find({ where: { saleReturnId: In(returnIds) } })
        : Promise.resolve([]),
    ]);
    const itemBrand = new Map<string, string | undefined>();
    const itemCategories = new Map<string, string[]>();
    for (const it of items) {
      itemBrand.set(it.id, it.brandId ?? undefined);
      itemCategories.set(
        it.id,
        (it.categories ?? []).map((c) => c.id),
      );
    }

    // Net out returns from line amounts by deducting per (saleItem-like) match.
    // Simplest: subtract returned line totals from same-item totals in the period.
    const returnedByItem = new Map<string, number>();
    for (const rl of returnLines) {
      returnedByItem.set(
        rl.itemId,
        (returnedByItem.get(rl.itemId) ?? 0) + Number(rl.lineTotal),
      );
    }

    const salesById = new Map(sales.map((s) => [s.id, s]));
    const itemById = new Map(items.map((i) => [i.id, i]));

    const rows: CalcRow[] = [];

    for (const ln of lines) {
      const sale = salesById.get(ln.saleId);
      if (!sale) continue;
      const item = itemById.get(ln.itemId);
      const lineAmount = Number(ln.lineTotal);
      const brandId = itemBrand.get(ln.itemId);
      const catIds = itemCategories.get(ln.itemId) ?? [];

      for (const rule of rules) {
        if (rule.startsOn && rule.startsOn > to) continue;
        if (rule.endsOn && rule.endsOn < from) continue;
        if (!ruleMatches(rule, ln.itemId, catIds, brandId)) continue;

        const amount = round2((lineAmount * Number(rule.percentage)) / 100);
        if (amount <= 0) continue;

        rows.push({
          employeeId: rule.employeeId,
          employeeName: rule.employee?.name ?? '—',
          ruleId: rule.id,
          basis: rule.basis,
          saleId: sale.id,
          invoiceNo: sale.invoiceNo,
          saleDate: sale.createdAt,
          itemName: item?.modelNo ?? item?.name ?? '—',
          baseAmount: lineAmount,
          percentage: Number(rule.percentage),
          amount,
        });
      }
    }

    // Subtract pro-rata returned portion per (employee, item).
    // Simple approximation: scale total commission per item by
    // (1 - returned/sold).
    const itemSoldTotals = new Map<string, number>();
    for (const ln of lines) {
      itemSoldTotals.set(
        ln.itemId,
        (itemSoldTotals.get(ln.itemId) ?? 0) + Number(ln.lineTotal),
      );
    }
    const adjusted = rows.map((r) => {
      // Find the item id back from rule basis isn't reliable, so re-derive
      // from the sale line. We persisted itemName but not itemId — rebuild:
      // (acceptable to skip return-netting here; the line-by-line view is
      // already accurate enough for v1).
      return r;
    });
    // NOTE: simple version — return-netting is done at the rollup level by
    // emitting negative rows so the ledger shows the offset clearly. See
    // commented future work below if pro-rata at the row level is needed.

    // Emit negative adjustment rows for items that were returned.
    for (const [itemId, returnedAmount] of returnedByItem.entries()) {
      const soldAmount = itemSoldTotals.get(itemId) ?? 0;
      if (soldAmount <= 0) continue;
      const item = itemById.get(itemId);
      // Find any rule that matches this item — emit reversal per rule.
      for (const rule of rules) {
        const brandId = itemBrand.get(itemId);
        const catIds = itemCategories.get(itemId) ?? [];
        if (!ruleMatches(rule, itemId, catIds, brandId)) continue;
        const reversal = round2((returnedAmount * Number(rule.percentage)) / 100);
        if (reversal <= 0) continue;
        adjusted.push({
          employeeId: rule.employeeId,
          employeeName: rule.employee?.name ?? '—',
          ruleId: rule.id,
          basis: rule.basis,
          saleId: '',
          invoiceNo: '(return netting)',
          saleDate: toDate,
          itemName: item?.modelNo ?? item?.name ?? '—',
          baseAmount: -returnedAmount,
          percentage: Number(rule.percentage),
          amount: -reversal,
        });
      }
    }

    const byEmployee: Record<string, number> = {};
    let total = 0;
    for (const r of adjusted) {
      byEmployee[r.employeeId] = round2(
        (byEmployee[r.employeeId] ?? 0) + r.amount,
      );
      total += r.amount;
    }
    return { rows: adjusted, byEmployee, total: round2(total) };
  }

  /** Sum of all employee incentives in a period. Consumed by ReportsService. */
  async totalForPeriod(from: string, to: string): Promise<number> {
    const { total } = await this.computeForPeriod(from, to);
    return total;
  }
}

function ruleMatches(
  rule: EmployeeIncentiveRule,
  itemId: string,
  categoryIds: string[],
  brandId?: string,
): boolean {
  switch (rule.basis) {
    case 'ALL_SALES':
      return true;
    case 'ITEM':
      return rule.referenceId === itemId;
    case 'CATEGORY':
      return rule.referenceId != null && categoryIds.includes(rule.referenceId);
    case 'BRAND':
      return rule.referenceId === brandId;
    default:
      return false;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
