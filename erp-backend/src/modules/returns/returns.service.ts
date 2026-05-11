import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SaleReturn } from './entities/sale-return.entity';
import { SaleReturnItem } from './entities/sale-return-item.entity';
import { PurchaseReturn } from './entities/purchase-return.entity';
import { PurchaseReturnItem } from './entities/purchase-return-item.entity';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { Item } from '../items/entities/item.entity';
import { StockService } from '../stock/stock.service';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(SaleReturn)
    private readonly saleReturns: Repository<SaleReturn>,
    @InjectRepository(PurchaseReturn)
    private readonly purchaseReturns: Repository<PurchaseReturn>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
  ) {}

  async createSaleReturn(dto: CreateSaleReturnDto): Promise<SaleReturn> {
    return this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const repo = manager.getRepository(SaleReturn);

      let totalAmount = 0;
      const lines: SaleReturnItem[] = [];
      for (const line of dto.lines) {
        const item = await itemRepo.findOne({ where: { id: line.itemId } });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
        const lineTotal = Number((line.unitPrice * line.quantity).toFixed(2));
        totalAmount += lineTotal;
        lines.push(
          manager.create(SaleReturnItem, {
            itemId: item.id,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal,
          }),
        );
      }

      const returnNo = dto.returnNo ?? (await this.nextReturnNo(repo, 'SR'));
      const saved = await repo.save(
        repo.create({
          returnNo,
          saleId: dto.saleId,
          customerId: dto.customerId,
          storeId: dto.storeId,
          totalAmount,
          reason: dto.reason,
          lines,
        }),
      );

      // Sale return → stock IN (goods come back)
      for (const ln of saved.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: dto.storeId,
            type: 'IN',
            quantity: ln.quantity,
            referenceType: 'SALE_RETURN',
            referenceId: saved.id,
          },
          manager,
        );
      }
      return saved;
    });
  }

  async createPurchaseReturn(
    dto: CreatePurchaseReturnDto,
  ): Promise<PurchaseReturn> {
    return this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const repo = manager.getRepository(PurchaseReturn);

      let totalAmount = 0;
      const lines: PurchaseReturnItem[] = [];
      for (const line of dto.lines) {
        const item = await itemRepo.findOne({ where: { id: line.itemId } });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
        const lineTotal = Number((line.unitPrice * line.quantity).toFixed(2));
        totalAmount += lineTotal;
        lines.push(
          manager.create(PurchaseReturnItem, {
            itemId: item.id,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal,
          }),
        );
      }

      const returnNo = dto.returnNo ?? (await this.nextReturnNo(repo, 'PR'));
      const saved = await repo.save(
        repo.create({
          returnNo,
          purchaseId: dto.purchaseId,
          supplierId: dto.supplierId,
          storeId: dto.storeId,
          totalAmount,
          reason: dto.reason,
          lines,
        }),
      );

      // Purchase return → stock OUT (goods leave warehouse)
      for (const ln of saved.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: dto.storeId,
            type: 'OUT',
            quantity: ln.quantity,
            referenceType: 'PURCHASE_RETURN',
            referenceId: saved.id,
          },
          manager,
        );
      }
      return saved;
    });
  }

  private async nextReturnNo(
    repo: Repository<SaleReturn> | Repository<PurchaseReturn>,
    prefix: string,
  ) {
    const count = await repo.count();
    return `${prefix}-${(count + 1).toString().padStart(6, '0')}`;
  }

  listSaleReturns() {
    return this.saleReturns.find({ order: { createdAt: 'DESC' } });
  }

  listPurchaseReturns() {
    return this.purchaseReturns.find({ order: { createdAt: 'DESC' } });
  }

  async findSaleReturn(id: string) {
    const r = await this.saleReturns.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Sale return ${id} not found`);
    return r;
  }

  async findPurchaseReturn(id: string) {
    const r = await this.purchaseReturns.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Purchase return ${id} not found`);
    return r;
  }
}
