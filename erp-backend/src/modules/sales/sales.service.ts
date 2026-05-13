import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { StockService } from '../stock/stock.service';
import { Item } from '../items/entities/item.entity';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async create(dto: CreateSaleDto, opts?: { skipOutbox?: boolean }): Promise<Sale> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const saleRepo = manager.getRepository(Sale);

      let totalAmount = 0;
      const lines: SaleItem[] = [];

      for (const line of dto.lines) {
        const item = await itemRepo.findOne({ where: { id: line.itemId } });
        if (!item) {
          throw new NotFoundException(`Item ${line.itemId} not found`);
        }
        const unitPrice =
          line.unitPrice != null ? line.unitPrice : Number(item.salePrice);
        const lineTotal = Number((unitPrice * line.quantity).toFixed(2));
        totalAmount += lineTotal;

        const sl = manager.create(SaleItem, {
          itemId: item.id,
          quantity: line.quantity,
          unitPrice,
          lineTotal,
        });
        lines.push(sl);
      }

      const discount = dto.discount ?? 0;
      const netAmount = Number((totalAmount - discount).toFixed(2));
      const paidAmount = dto.paidAmount ?? netAmount;
      const dueAmount = Number((netAmount - paidAmount).toFixed(2));

      const invoiceNo = dto.invoiceNo ?? (await this.nextInvoiceNo(saleRepo));

      // Sales paid in cash/card/bank credit a specific account (cash drawer,
      // bank wallet, etc.). CREDIT-method sales must not pin an account —
      // nothing is collected yet, the whole amount sits as A/R.
      const paymentMethod = dto.paymentMethod ?? 'CASH';
      const accountId = paymentMethod === 'CREDIT' ? undefined : dto.accountId;

      const sale = saleRepo.create({
        invoiceNo,
        customerId: dto.customerId,
        storeId: dto.storeId,
        totalAmount,
        discount,
        netAmount,
        paidAmount,
        dueAmount,
        paymentMethod,
        accountId,
        notes: dto.notes,
        lines,
      });
      const persisted = await saleRepo.save(sale);

      for (const ln of persisted.lines) {
        await this.stockService.recordMovement(
          {
            itemId: ln.itemId,
            storeId: dto.storeId,
            type: 'OUT',
            quantity: ln.quantity,
            referenceType: 'SALE',
            referenceId: persisted.id,
          },
          manager,
        );
      }

      return persisted;
    });

    // Local-first nodes (those configured with CLOUD_SYNC_URL) enqueue
    // every locally-originated sale for the background worker to push.
    // skipOutbox is true when this create() is called from the cloud receiver.
    if (!opts?.skipOutbox && process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('SALE_CREATED', { ...dto, invoiceNo: saved.invoiceNo });
    }

    return saved;
  }

  private async nextInvoiceNo(repo: Repository<Sale>): Promise<string> {
    const count = await repo.count();
    const seq = (count + 1).toString().padStart(6, '0');
    return `INV-${seq}`;
  }

  findAll() {
    return this.sales.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const sale = await this.sales.findOne({ where: { id } });
    if (!sale) throw new NotFoundException(`Sale ${id} not found`);
    return sale;
  }
}
