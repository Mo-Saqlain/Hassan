import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly orders: Repository<PurchaseOrder>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('PurchaseOrder must have at least one line');
    }
    return this.dataSource.transaction(async (manager) => {
      const poRepo = manager.getRepository(PurchaseOrder);
      const poNo = dto.poNo ?? (await this.nextPoNo(poRepo));

      let totalAmount = 0;
      const lines: PurchaseOrderItem[] = [];
      for (const ln of dto.lines) {
        const lineTotal = Number(
          (ln.quantity * ln.expectedUnitCost).toFixed(2),
        );
        totalAmount += lineTotal;
        lines.push(
          manager.create(PurchaseOrderItem, {
            itemId: ln.itemId,
            quantity: ln.quantity,
            expectedUnitCost: ln.expectedUnitCost,
            lineTotal,
          }),
        );
      }

      const po = poRepo.create({
        poNo,
        supplierId: dto.supplierId,
        orderDate: dto.orderDate ?? today(),
        expectedDate: dto.expectedDate,
        status: dto.status ?? 'DRAFT',
        totalAmount: Number(totalAmount.toFixed(2)),
        notes: dto.notes,
        lines,
      });
      return poRepo.save(po);
    });
  }

  private async nextPoNo(repo: Repository<PurchaseOrder>): Promise<string> {
    const count = await repo.count();
    return `PO-${(count + 1).toString().padStart(6, '0')}`;
  }

  findAll(supplierId?: string, status?: string) {
    const where: any = {};
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    return this.orders.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const po = await this.orders.findOne({ where: { id } });
    if (!po) throw new NotFoundException(`PurchaseOrder ${id} not found`);
    return po;
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    const po = await this.findOne(id);
    po.status = dto.status;
    if (dto.notes) {
      po.notes = (po.notes ? po.notes + '\n' : '') + dto.notes;
    }
    return this.orders.save(po);
  }

  async remove(id: string) {
    const po = await this.findOne(id);
    await this.orders.remove(po);
    return { deleted: true, id };
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
