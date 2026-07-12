import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockTransfer } from './entities/stock-transfer.entity';
import { StockTransferItem } from './entities/stock-transfer-item.entity';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { StockService } from '../stock/stock.service';
import { SequenceService } from '../sequences/sequence.service';

@Injectable()
export class StockTransfersService {
  constructor(
    @InjectRepository(StockTransfer)
    private readonly repo: Repository<StockTransfer>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
    private readonly sequences: SequenceService,
  ) {}

  /**
   * Move stock between stores. Inside a single transaction we:
   *   1. Persist the transfer + lines.
   *   2. Record one OUT movement at the source store per line.
   *   3. Record one IN movement at the destination store per line.
   * If any OUT is short, the existing StockService validation throws and
   * the whole transaction rolls back so the books stay consistent.
   */
  async create(dto: CreateStockTransferDto): Promise<StockTransfer> {
    if (dto.fromStoreId === dto.toStoreId) {
      throw new BadRequestException(
        'fromStoreId and toStoreId must differ — pick two different stores',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const transferRepo = manager.getRepository(StockTransfer);
      const transferNo = dto.transferNo ?? (await this.nextTransferNo(transferRepo));

      const lines: StockTransferItem[] = dto.lines.map((ln) =>
        manager.create(StockTransferItem, {
          itemId: ln.itemId,
          quantity: ln.quantity,
        }),
      );
      const transfer = transferRepo.create({
        transferNo,
        fromStoreId: dto.fromStoreId,
        toStoreId: dto.toStoreId,
        transferDate: dto.transferDate ?? today(),
        notes: dto.notes,
        lines,
      });
      const persisted = await transferRepo.save(transfer);

      for (const ln of persisted.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: dto.fromStoreId,
            type: 'OUT',
            quantity: ln.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: persisted.id,
            note: `Transfer out → ${persisted.transferNo}`,
          },
          manager,
        );
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: dto.toStoreId,
            type: 'IN',
            quantity: ln.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: persisted.id,
            note: `Transfer in ← ${persisted.transferNo}`,
          },
          manager,
        );
      }

      return persisted;
    });
  }

  private async nextTransferNo(
    repo: Repository<StockTransfer>,
  ): Promise<string> {
    return this.sequences.next('STK-TRF', () => repo.count());
  }

  findAll(fromStoreId?: string, toStoreId?: string) {
    const where: any = {};
    if (fromStoreId) where.fromStoreId = fromStoreId;
    if (toStoreId) where.toStoreId = toStoreId;
    return this.repo.find({
      where,
      order: { transferDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`StockTransfer ${id} not found`);
    return t;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
