import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Sale } from '../sales/entities/sale.entity';
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
import { RecostService } from '../costing/recost.service';

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
    private readonly recost: RecostService,
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
      const serials = (line.serials ?? [])
        .map((s) => s.trim())
        .filter(Boolean);
      lines.push(
        manager.create(SaleReturnItem, {
          itemId: item.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal,
          serials: serials.length > 0 ? serials : undefined,
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

  /**
   * Walk back a sale return that was booked in error.
   *
   * Returns post no journal entry (they're operational-only), so there is no
   * ledger half to reverse — the whole job is undoing the physical and the
   * derived-figure sides:
   *   • RESTOCK            → stock OUT (the goods never actually came back) and
   *                          costedQty drops again.
   *   • CLAIMED_TO_COMPANY → nothing physical to undo (no movement was booked).
   *   • serials            → back to SOLD, best-effort, from the list recorded
   *                          on each line.
   *   • money              → nothing is posted here. Setting `reversedAt` is what
   *                          removes this return from A/R netting, from the daily
   *                          cash book's refund OUT, and from incentive netting,
   *                          because every one of those filters reversed rows out.
   *
   * NOTE on a refunded return: reversing it also removes the cash-refund OUT
   * from the daily cash book, so `expectedClosing` goes back up. That is only
   * correct if the cash physically came back to the till — which is the whole
   * premise of "this return was a mistake".
   *
   * The row is never deleted; `reversedAt` + `reversalReason` keep the mistake
   * and its explanation on the record. Idempotent on `reversedAt`.
   */
  async reverseSaleReturn(
    id: string,
    opts: { reason: string; userId?: string },
  ): Promise<SaleReturn> {
    return this.dataSource.transaction((manager) =>
      this.reverseSaleReturnInTransaction(manager, id, opts),
    );
  }

  /** Body of the above, scoped to a caller's EntityManager so an exchange
   *  reversal can unwind all its legs atomically. */
  async reverseSaleReturnInTransaction(
    manager: EntityManager,
    id: string,
    opts: { reason: string; userId?: string },
  ): Promise<SaleReturn> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('Reversal requires a reason.');
    }
    const reason = opts.reason.trim();

    return (async () => {
      const repo = manager.getRepository(SaleReturn);
      const ret = await repo.findOne({ where: { id }, relations: ['lines'] });
      if (!ret) throw new NotFoundException(`Sale return ${id} not found`);
      if (ret.reversedAt) return ret; // already reversed — idempotent

      // An exchange is one transaction wearing two hats: this return is the
      // give-back leg, and its store credit is what funded the replacement
      // sale. Undoing the credit while the replacement still stands would
      // leave the customer owing money for goods they swapped into, so insist
      // on an order: replacement sale first, then this.
      if (ret.replacementSaleId) {
        const sale = await manager
          .getRepository(Sale)
          .findOne({ where: { id: ret.replacementSaleId } });
        if (sale && !sale.reversedAt) {
          throw new BadRequestException(
            `Return ${ret.returnNo} is the give-back leg of an exchange against sale ${sale.invoiceNo}. ` +
              `Reverse that sale first, then reverse this return.`,
          );
        }
      }

      // Physical leg — only RESTOCK ever moved stock, so only RESTOCK unwinds.
      // The OUT can legitimately fail: if the returned unit has already been
      // re-sold, on-hand won't cover it. StockService raises the negative-stock
      // guard, which is the right answer — the operator must sort the physical
      // stock out before the paperwork can be corrected.
      if (ret.disposition === 'RESTOCK') {
        const itemRepo = manager.getRepository(Item);
        for (const ln of ret.lines) {
          await this.stockService.recordMovement(
            {
              itemId: ln.itemId,
              storeId: ret.storeId,
              type: 'OUT',
              quantity: ln.quantity,
              referenceType: 'SALE_RETURN_REVERSAL',
              referenceId: ret.id,
              note: `Reversal of ${ret.returnNo}: ${reason}`,
            },
            manager,
          );
          const it = await itemRepo.findOne({ where: { id: ln.itemId } });
          if (it) {
            it.costedQty = Math.max(
              0,
              Number(it.costedQty) - Number(ln.quantity),
            );
            await itemRepo.save(it);
          }
        }
      }

      // Serial lifecycle — back to SOLD. Best-effort for the same reason the
      // forward path is: the physical outcome stands whether or not every
      // serial resolves, and a unit handled again since the return (now
      // IN_STOCK or DAMAGED) is refused rather than silently rewritten.
      for (const ln of ret.lines) {
        for (const s of ln.serials ?? []) {
          try {
            await this.itemSerials.restoreToSold(s, manager);
          } catch {
            // Tolerated — see above.
          }
        }
      }

      ret.reversedAt = new Date();
      ret.reversalReason = reason;
      const saved = await repo.save(ret);

      await this.recost.recomputeItems(
        ret.lines.map((l) => l.itemId),
        { manager },
      );

      return saved;
    })();
  }

  /**
   * Walk back a purchase return booked in error. Mirror image of the sale-return
   * case: a STOCK return sent goods out, so the reversal brings them back IN and
   * restores costedQty; a WARRANTY_CREDIT return moved no goods, so only the flag
   * changes. Setting `reversedAt` is what drops it out of the supplier ledger and
   * A/P balances. Idempotent on `reversedAt`.
   */
  async reversePurchaseReturn(
    id: string,
    opts: { reason: string; userId?: string },
  ): Promise<PurchaseReturn> {
    return this.dataSource.transaction((manager) =>
      this.reversePurchaseReturnInTransaction(manager, id, opts),
    );
  }

  /** Body of the above, scoped to a caller's EntityManager. */
  async reversePurchaseReturnInTransaction(
    manager: EntityManager,
    id: string,
    opts: { reason: string; userId?: string },
  ): Promise<PurchaseReturn> {
    if (!opts.reason || opts.reason.trim().length === 0) {
      throw new BadRequestException('Reversal requires a reason.');
    }
    const reason = opts.reason.trim();

    return (async () => {
      const repo = manager.getRepository(PurchaseReturn);
      const ret = await repo.findOne({ where: { id }, relations: ['lines'] });
      if (!ret) throw new NotFoundException(`Purchase return ${id} not found`);
      if (ret.reversedAt) return ret; // already reversed — idempotent

      if (ret.disposition === 'STOCK') {
        const itemRepo = manager.getRepository(Item);
        for (const ln of ret.lines) {
          await this.stockService.recordMovement(
            {
              itemId: ln.itemId,
              storeId: ret.storeId,
              type: 'IN',
              quantity: ln.quantity,
              referenceType: 'PURCHASE_RETURN_REVERSAL',
              referenceId: ret.id,
              note: `Reversal of ${ret.returnNo}: ${reason}`,
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

      ret.reversedAt = new Date();
      ret.reversalReason = reason;
      const saved = await repo.save(ret);

      await this.recost.recomputeItems(
        ret.lines.map((l) => l.itemId),
        { manager },
      );

      return saved;
    })();
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
