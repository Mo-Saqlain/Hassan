import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  StockMovement,
  StockMovementType,
  StockReferenceType,
} from './entities/stock-movement.entity';
import { Item } from '../items/entities/item.entity';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StocktakeDto } from './dto/stocktake.dto';
import { SequenceService } from '../sequences/sequence.service';

interface RecordMovementInput {
  itemId: string;
  storeId?: string;
  type: StockMovementType;
  quantity: number;
  referenceType: StockReferenceType;
  referenceId: string;
  note?: string;
}

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockMovement)
    private readonly movements: Repository<StockMovement>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly sequences: SequenceService,
  ) {}

  /**
   * Records a stock movement. Validates that OUT movements do not drive stock negative.
   * If `manager` is passed, runs inside that transaction.
   */
  async recordMovement(
    input: RecordMovementInput,
    manager?: EntityManager,
  ): Promise<StockMovement> {
    const repo = manager
      ? manager.getRepository(StockMovement)
      : this.movements;
    const itemsRepo = manager ? manager.getRepository(Item) : this.items;

    const item = await itemsRepo.findOne({ where: { id: input.itemId } });
    if (!item) throw new NotFoundException(`Item ${input.itemId} not found`);

    if (input.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    if (input.type === 'OUT') {
      const onHand = await this.getOnHandWithRepo(
        repo,
        input.itemId,
        input.storeId,
      );
      if (onHand < input.quantity) {
        throw new BadRequestException(
          `Insufficient stock for item ${item.name} (on hand ${onHand}, requested ${input.quantity})`,
        );
      }
    }

    const mv = repo.create({
      itemId: input.itemId,
      storeId: input.storeId,
      type: input.type,
      quantity: input.quantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      note: input.note,
    });
    return repo.save(mv);
  }

  async adjust(dto: StockAdjustmentDto) {
    return this.recordMovement({
      itemId: dto.itemId,
      storeId: dto.storeId,
      type: dto.type,
      quantity: dto.quantity,
      referenceType: 'ADJUSTMENT',
      referenceId: 'manual',
      note: dto.note,
    });
  }

  /**
   * Physical stocktake: reconcile counted-on-shelf quantities against the
   * system on-hand in one reviewed batch. For each counted line we snapshot
   * the current on-hand, compute the variance (counted − system), and post a
   * single ADJUSTMENT movement (IN if we found more than the system knew,
   * OUT if less) — all under one shared reference (`referenceId`) so the whole
   * count groups together in the stock ledger. Lines with zero variance touch
   * nothing. Runs in one transaction: either the whole count posts or none of
   * it does.
   *
   * NOTE: system on-hand already reflects everything sold — including booked
   * units, which are deducted at sale time. Count only what's physically
   * unsold on the shelf, or a held booking will read as a positive variance.
   */
  async stocktake(dto: StocktakeDto) {
    const reference = await this.sequences.next('STC');
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StockMovement);
      const itemsRepo = manager.getRepository(Item);

      const results: Array<{
        itemId: string;
        itemName: string;
        systemQty: number;
        countedQty: number;
        variance: number;
        adjusted: boolean;
      }> = [];

      for (const line of dto.lines) {
        const item = await itemsRepo.findOne({ where: { id: line.itemId } });
        if (!item) {
          throw new NotFoundException(`Item ${line.itemId} not found`);
        }
        const systemQty = await this.getOnHandWithRepo(
          repo,
          line.itemId,
          dto.storeId,
        );
        const variance = line.countedQty - systemQty;
        if (variance !== 0) {
          await this.recordMovement(
            {
              itemId: line.itemId,
              storeId: dto.storeId,
              type: variance > 0 ? 'IN' : 'OUT',
              quantity: Math.abs(variance),
              referenceType: 'ADJUSTMENT',
              referenceId: reference,
              note: `Stocktake ${reference} · system ${systemQty} → counted ${line.countedQty}${dto.note ? ' · ' + dto.note : ''}`,
            },
            manager,
          );
        }
        results.push({
          itemId: line.itemId,
          itemName: item.name,
          systemQty,
          countedQty: line.countedQty,
          variance,
          adjusted: variance !== 0,
        });
      }

      const varianceLines = results.filter((r) => r.variance !== 0);
      return {
        reference,
        storeId: dto.storeId ?? null,
        countedLines: results.length,
        varianceLines: varianceLines.length,
        netUnits: varianceLines.reduce((s, r) => s + r.variance, 0),
        lines: results,
      };
    });
  }

  private async getOnHandWithRepo(
    repo: Repository<StockMovement>,
    itemId: string,
    storeId?: string,
  ): Promise<number> {
    const qb = repo
      .createQueryBuilder('m')
      .select(
        "SUM(CASE WHEN m.type = 'IN' THEN m.quantity ELSE -m.quantity END)",
        'qty',
      )
      .where('m.item_id = :itemId', { itemId });
    if (storeId) qb.andWhere('m.store_id = :storeId', { storeId });
    const result = await qb.getRawOne<{ qty: string | null }>();
    return Number(result?.qty ?? 0);
  }

  async getOnHand(itemId: string, storeId?: string) {
    return this.getOnHandWithRepo(this.movements, itemId, storeId);
  }

  async listMovements(itemId?: string, storeId?: string) {
    const qb = this.movements
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.item', 'item')
      .leftJoinAndSelect('m.store', 'store')
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .limit(500);
    if (itemId) qb.andWhere('m.item_id = :itemId', { itemId });
    if (storeId) qb.andWhere('m.store_id = :storeId', { storeId });
    return qb.getMany();
  }

  async stockSummary() {
    const rows = await this.movements
      .createQueryBuilder('m')
      .innerJoin('m.item', 'item')
      .select('item.id', 'itemId')
      .addSelect('item.name', 'itemName')
      .addSelect('item.sku', 'sku')
      .addSelect('item.min_stock_level', 'minStockLevel')
      .addSelect('item.reserved_qty', 'reservedQty')
      .addSelect('item.avg_cost', 'avgCost')
      .addSelect(
        "SUM(CASE WHEN m.type = 'IN' THEN m.quantity ELSE -m.quantity END)",
        'onHand',
      )
      .groupBy('item.id')
      .addGroupBy('item.name')
      .addGroupBy('item.sku')
      .addGroupBy('item.min_stock_level')
      .addGroupBy('item.reserved_qty')
      .addGroupBy('item.avg_cost')
      .orderBy('item.name', 'ASC')
      .getRawMany();

    return rows.map((r) => {
      const onHand = Number(r.onHand ?? 0);
      const reservedQty = Number(r.reservedQty ?? 0);
      return {
        itemId: r.itemId,
        itemName: r.itemName,
        sku: r.sku,
        minStockLevel: Number(r.minStockLevel ?? 0),
        onHand,
        reservedQty,
        // `available` is the user-meaningful figure on the POS path —
        // physically on hand minus units already promised to a pending
        // delivery / sales order.
        available: Math.max(0, onHand - reservedQty),
        avgCost: Number(r.avgCost ?? 0),
        valueAtCost: Number((onHand * Number(r.avgCost ?? 0)).toFixed(2)),
      };
    });
  }
}
