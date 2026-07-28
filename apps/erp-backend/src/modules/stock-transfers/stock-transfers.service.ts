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

  /**
   * Correct a transfer in place — same transfer number, same row. A transfer is
   * pure stock movement, so the edit mirrors the original pair back (OUT of the
   * old destination, IN to the old source) and books the corrected pair. No
   * journal and no cost side: stock moves between stores at unchanged cost.
   *
   * Refused if the old destination no longer holds the units, same as reversal.
   */
  async edit(
    id: string,
    dto: CreateStockTransferDto,
    opts: { reason: string; userId?: string },
  ): Promise<StockTransfer> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('An edit needs a reason.');
    }
    if (dto.fromStoreId === dto.toStoreId) {
      throw new BadRequestException(
        'fromStoreId and toStoreId must differ — pick two different stores',
      );
    }
    const reason = opts.reason.trim();

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StockTransfer);
      const original = await repo.findOne({
        where: { id },
        relations: ['lines'],
      });
      if (!original) throw new NotFoundException(`Stock transfer ${id} not found`);
      if (original.reversedAt) {
        throw new BadRequestException(
          `Transfer ${original.transferNo} is reversed. Enter a new transfer instead of editing this one.`,
        );
      }

      // Mirror the original movements back.
      for (const ln of original.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: original.toStoreId,
            type: 'OUT',
            quantity: ln.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: original.id,
            note: `Edit of ${original.transferNo}: ${reason}`,
          },
          manager,
        );
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: original.fromStoreId,
            type: 'IN',
            quantity: ln.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: original.id,
            note: `Edit of ${original.transferNo}: ${reason}`,
          },
          manager,
        );
      }

      await manager
        .getRepository(StockTransferItem)
        .delete({ stockTransferId: original.id });

      const lines = dto.lines.map((ln) =>
        manager.create(StockTransferItem, {
          itemId: ln.itemId,
          quantity: ln.quantity,
        }),
      );
      Object.assign(original, {
        fromStoreId: dto.fromStoreId,
        toStoreId: dto.toStoreId,
        transferDate: dto.transferDate ?? original.transferDate,
        notes: dto.notes,
        lines,
      });
      original.fromStore = undefined as unknown as StockTransfer['fromStore'];
      original.toStore = undefined as unknown as StockTransfer['toStore'];
      original.editCount = Number(original.editCount ?? 0) + 1;
      original.lastEditedAt = new Date();
      original.lastEditReason = reason;
      const saved = await repo.save(original);

      for (const ln of saved.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: saved.fromStoreId,
            type: 'OUT',
            quantity: ln.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: saved.id,
            note: `Transfer out → ${saved.transferNo}`,
          },
          manager,
        );
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: saved.toStoreId,
            type: 'IN',
            quantity: ln.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: saved.id,
            note: `Transfer in ← ${saved.transferNo}`,
          },
          manager,
        );
      }

      return saved;
    });
  }

  /**
   * Walk back a transfer sent to the wrong store (or entered twice) by booking
   * the mirror movements: OUT of the destination, IN to the source. No cost side
   * — a transfer moves stock between stores at unchanged cost, so `costedQty`
   * and `avgCost` were never touched going forward and need no recost coming
   * back.
   *
   * Idempotent on `reversedAt`. Refused when the destination no longer holds the
   * units (they were sold or transferred onward): `StockService` raises its
   * negative-stock guard and the whole transaction rolls back, because the
   * physical stock has to be sorted out before the paperwork can be.
   */
  async reverse(
    id: string,
    opts: { reason: string; userId?: string },
  ): Promise<StockTransfer> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('Reversal requires a reason.');
    }
    const reason = opts.reason.trim();

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StockTransfer);
      const transfer = await repo.findOne({
        where: { id },
        relations: ['lines'],
      });
      if (!transfer) throw new NotFoundException(`Stock transfer ${id} not found`);
      if (transfer.reversedAt) return transfer; // idempotent

      for (const ln of transfer.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: transfer.toStoreId,
            type: 'OUT',
            quantity: ln.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: transfer.id,
            note: `Reversal of ${transfer.transferNo}: ${reason}`,
          },
          manager,
        );
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: transfer.fromStoreId,
            type: 'IN',
            quantity: ln.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: transfer.id,
            note: `Reversal of ${transfer.transferNo}: ${reason}`,
          },
          manager,
        );
      }

      transfer.reversedAt = new Date();
      transfer.reversalReason = reason;
      return repo.save(transfer);
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
