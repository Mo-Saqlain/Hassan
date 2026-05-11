import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { StockService } from '../stock/stock.service';
import { Item } from '../items/entities/item.entity';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    dto: CreatePurchaseDto,
    opts?: { skipOutbox?: boolean },
  ): Promise<Purchase> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const purchaseRepo = manager.getRepository(Purchase);

      let totalAmount = 0;
      const lines: PurchaseItem[] = [];

      for (const line of dto.lines) {
        const item = await itemRepo.findOne({ where: { id: line.itemId } });
        if (!item) {
          throw new NotFoundException(`Item ${line.itemId} not found`);
        }
        const unitPrice = line.unitPrice;
        const lineTotal = Number((unitPrice * line.quantity).toFixed(2));
        totalAmount += lineTotal;

        const pl = manager.create(PurchaseItem, {
          itemId: item.id,
          quantity: line.quantity,
          unitPrice,
          lineTotal,
        });
        lines.push(pl);
      }

      const discount = dto.discount ?? 0;
      const netAmount = Number((totalAmount - discount).toFixed(2));
      const paidAmount = dto.paidAmount ?? 0;
      const dueAmount = Number((netAmount - paidAmount).toFixed(2));

      const billNo = dto.billNo ?? (await this.nextBillNo(purchaseRepo));

      const purchase = purchaseRepo.create({
        billNo,
        supplierId: dto.supplierId,
        storeId: dto.storeId,
        totalAmount,
        discount,
        netAmount,
        paidAmount,
        dueAmount,
        paymentMethod: dto.paymentMethod ?? 'CASH',
        notes: dto.notes,
        lines,
      });
      const persisted = await purchaseRepo.save(purchase);

      for (const ln of persisted.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: dto.storeId,
            type: 'IN',
            quantity: ln.quantity,
            referenceType: 'PURCHASE',
            referenceId: persisted.id,
          },
          manager,
        );
      }

      return persisted;
    });

    if (!opts?.skipOutbox && process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('PURCHASE_CREATED', {
        ...dto,
        billNo: saved.billNo,
      });
    }

    return saved;
  }

  private async nextBillNo(repo: Repository<Purchase>): Promise<string> {
    const count = await repo.count();
    const seq = (count + 1).toString().padStart(6, '0');
    return `BILL-${seq}`;
  }

  findAll() {
    return this.purchases.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const p = await this.purchases.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Purchase ${id} not found`);
    return p;
  }
}
