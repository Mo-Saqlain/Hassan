import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SaleReturn } from './entities/sale-return.entity';
import { SaleReturnItem } from './entities/sale-return-item.entity';
import { PurchaseReturn } from './entities/purchase-return.entity';
import { PurchaseReturnItem } from './entities/purchase-return-item.entity';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { Item } from '../items/entities/item.entity';
import { StockService } from '../stock/stock.service';
import { SequenceService } from '../sequences/sequence.service';
import { ItemSerialsService } from '../item-serials/item-serials.service';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(SaleReturn)
    private readonly saleReturns: Repository<SaleReturn>,
    @InjectRepository(PurchaseReturn)
    private readonly purchaseReturns: Repository<PurchaseReturn>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
    private readonly sequences: SequenceService,
    private readonly itemSerials: ItemSerialsService,
  ) {}

  async createSaleReturn(dto: CreateSaleReturnDto): Promise<SaleReturn> {
    return this.dataSource.transaction((manager) =>
      this.createSaleReturnInTransaction(manager, dto),
    );
  }

  /**
   * Sale-return body, scoped to a caller-supplied EntityManager so it can run
   * inside a larger atomic transaction (e.g. an exchange: return + new sale).
   *
   * disposition drives the physical leg:
   *   • RESTOCK (default)   → stock IN + costedQty bump; serials → RETURNED.
   *   • CLAIMED_TO_COMPANY  → NO stock movement, NO costedQty change (the unit
   *                           left to the manufacturer, never our shelf);
   *                           serials → WRITE_OFF.
   * The money side (refund vs store credit) is independent of disposition and
   * handled the same way in both cases.
   */
  async createSaleReturnInTransaction(
    manager: EntityManager,
    dto: CreateSaleReturnDto,
  ): Promise<SaleReturn> {
    const itemRepo = manager.getRepository(Item);
    const repo = manager.getRepository(SaleReturn);
    const disposition = dto.disposition ?? 'RESTOCK';
    const restock = disposition === 'RESTOCK';

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
    // If a refund account is given, record the cash actually handed back —
    // defaulting to the full return value when no explicit amount is passed.
    const refundAmount = dto.refundAccountId
      ? Number((dto.refundAmount ?? totalAmount).toFixed(2))
      : undefined;
    const saved = await repo.save(
      repo.create({
        returnNo,
        saleId: dto.saleId,
        customerId: dto.customerId,
        storeId: dto.storeId,
        totalAmount,
        disposition,
        replacementSaleId: dto.replacementSaleId,
        refundAccountId: dto.refundAccountId,
        refundAmount,
        reason: dto.reason,
        lines,
      }),
    );

    // Physical leg — only when the goods actually come back to our shelf.
    // A CLAIMED_TO_COMPANY unit never re-enters stock, so we book nothing here.
    if (restock) {
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
        const it = await itemRepo.findOne({ where: { id: ln.itemId } });
        if (it) {
          it.costedQty = Number(it.costedQty) + Number(ln.quantity);
          await itemRepo.save(it);
        }
      }
    }

    // Serial lifecycle — RESTOCK returns the unit to the RETURNED state;
    // a company claim writes it off (it left to the manufacturer). Best-effort
    // in both cases: a torn-label return may come back without a readable
    // serial, and the stock/credit sides don't depend on the serial mapping.
    for (const ln of dto.lines) {
      for (const s of ln.serials ?? []) {
        const cleaned = s.trim();
        if (!cleaned) continue;
        try {
          if (restock) {
            await this.itemSerials.markReturned(cleaned, manager);
          } else {
            await this.itemSerials.markWrittenOff(cleaned, manager);
          }
        } catch {
          // Tolerate "not found" / "not currently sold" — the physical
          // outcome stands regardless of whether the serial resolved.
        }
      }
    }
    return saved;
  }

  async createPurchaseReturn(
    dto: CreatePurchaseReturnDto,
  ): Promise<PurchaseReturn> {
    return this.dataSource.transaction((manager) =>
      this.createPurchaseReturnInTransaction(manager, dto),
    );
  }

  /**
   * Purchase-return body, scoped to a caller-supplied EntityManager.
   *
   * disposition drives the physical leg:
   *   • STOCK (default)   → stock OUT + costedQty drop (goods go to supplier).
   *   • WARRANTY_CREDIT   → NO stock movement (a manufacturer credited our
   *                         ledger for a unit that never re-entered our stock);
   *                         only the supplier ledger is credited by totalAmount.
   */
  async createPurchaseReturnInTransaction(
    manager: EntityManager,
    dto: CreatePurchaseReturnDto,
  ): Promise<PurchaseReturn> {
    const itemRepo = manager.getRepository(Item);
    const repo = manager.getRepository(PurchaseReturn);
    const disposition = dto.disposition ?? 'STOCK';
    const moveStock = disposition === 'STOCK';

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
        disposition,
        reason: dto.reason,
        lines,
      }),
    );

    // Physical leg — skipped for a pure WARRANTY_CREDIT (no goods leave us).
    if (moveStock) {
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
        const it = await itemRepo.findOne({ where: { id: ln.itemId } });
        if (it) {
          it.costedQty = Math.max(0, Number(it.costedQty) - Number(ln.quantity));
          await itemRepo.save(it);
        }
      }
    }
    return saved;
  }

  private async nextReturnNo(
    repo: Repository<SaleReturn> | Repository<PurchaseReturn>,
    prefix: string,
  ) {
    return this.sequences.next(prefix, () => repo.count());
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
