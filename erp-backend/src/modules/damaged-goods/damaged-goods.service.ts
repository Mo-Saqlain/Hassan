import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  DamagedGood,
  DamageStatus,
} from './entities/damaged-good.entity';
import { CreateDamagedGoodDto } from './dto/create-damaged-good.dto';
import { UpdateDamageStatusDto } from './dto/update-status.dto';
import { StockService } from '../stock/stock.service';

@Injectable()
export class DamagedGoodsService {
  constructor(
    @InjectRepository(DamagedGood)
    private readonly repo: Repository<DamagedGood>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateDamagedGoodDto): Promise<DamagedGood> {
    return this.dataSource.transaction(async (manager) => {
      const damageRepo = manager.getRepository(DamagedGood);
      const voucherNo = await this.nextVoucherNo(damageRepo);
      const row = damageRepo.create({
        ...dto,
        voucherNo,
        status: dto.status ?? 'DAMAGED',
        reportedOn: dto.reportedOn ?? today(),
      });
      const persisted = await damageRepo.save(row);

      // Pull the matching quantity out of sellable stock.
      await this.stockService.recordMovement(
        {
          itemId: dto.itemId,
          storeId: dto.storeId,
          type: 'OUT',
          quantity: dto.quantity,
          referenceType: 'ADJUSTMENT',
          referenceId: persisted.id,
          note: `Damaged goods ${persisted.voucherNo} · ${persisted.status}${dto.reason ? ' · ' + dto.reason : ''}`,
        },
        manager,
      );

      return persisted;
    });
  }

  private async nextVoucherNo(repo: Repository<DamagedGood>): Promise<string> {
    const count = await repo.count();
    return `DMG-${(count + 1).toString().padStart(6, '0')}`;
  }

  findAll(status?: DamageStatus) {
    return this.repo.find({
      where: status ? { status } : {},
      order: { reportedOn: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException(`Damage record ${id} not found`);
    return d;
  }

  async updateStatus(id: string, dto: UpdateDamageStatusDto) {
    const d = await this.findOne(id);
    const wasOutOfStock = isOutOfStock(d.status);
    const willBeOutOfStock = isOutOfStock(dto.status);

    return this.dataSource.transaction(async (manager) => {
      const damageRepo = manager.getRepository(DamagedGood);
      d.status = dto.status;
      if (dto.notes) {
        d.notes = (d.notes ? d.notes + '\n' : '') + dto.notes;
      }
      if (dto.status === 'REPAIRED') {
        d.resolvedOn = today();
      }
      const saved = await damageRepo.save(d);

      // Stock movement reversal: if we're moving FROM out-of-stock TO
      // REPAIRED, the goods come back — book an IN movement.
      if (wasOutOfStock && !willBeOutOfStock && dto.status === 'REPAIRED') {
        await this.stockService.recordMovement(
          {
            itemId: d.itemId,
            storeId: d.storeId,
            type: 'IN',
            quantity: d.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: d.id,
            note: `Returned from repair · ${d.voucherNo}`,
          },
          manager,
        );
      }
      // Edge: marking a REPAIRED record back to DAMAGED — pull stock out
      // again. Unusual but supported for correctness.
      if (!wasOutOfStock && willBeOutOfStock) {
        await this.stockService.recordMovement(
          {
            itemId: d.itemId,
            storeId: d.storeId,
            type: 'OUT',
            quantity: d.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: d.id,
            note: `Re-damaged · ${d.voucherNo}`,
          },
          manager,
        );
      }
      return saved;
    });
  }

  async remove(id: string) {
    const d = await this.findOne(id);
    if (isOutOfStock(d.status)) {
      // Reverse the stock-out so we don't leak inventory when the record
      // is deleted before being resolved.
      throw new BadRequestException(
        `Cannot delete a record still in status ${d.status}. Mark it REPAIRED first so the stock reverses, then delete.`,
      );
    }
    await this.repo.remove(d);
    return { deleted: true, id };
  }

  async tally() {
    const all = await this.repo.find();
    const out = { DAMAGED: 0, IN_REPAIR: 0, WRITE_OFF: 0, REPAIRED: 0 };
    for (const r of all) out[r.status] += Number(r.quantity ?? 0);
    return out;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOutOfStock(status: DamageStatus): boolean {
  return (
    status === 'DAMAGED' || status === 'IN_REPAIR' || status === 'WRITE_OFF'
  );
}
