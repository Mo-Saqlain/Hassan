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
      .orderBy('m.created_at', 'DESC')
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
      .addSelect(
        "SUM(CASE WHEN m.type = 'IN' THEN m.quantity ELSE -m.quantity END)",
        'onHand',
      )
      .groupBy('item.id')
      .addGroupBy('item.name')
      .addGroupBy('item.sku')
      .addGroupBy('item.min_stock_level')
      .orderBy('item.name', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      sku: r.sku,
      minStockLevel: Number(r.minStockLevel ?? 0),
      onHand: Number(r.onHand ?? 0),
    }));
  }
}
