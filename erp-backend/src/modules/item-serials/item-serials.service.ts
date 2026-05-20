import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ItemSerial, ItemSerialStatus } from './entities/item-serial.entity';
import { Item } from '../items/entities/item.entity';
import { RegisterSerialsDto } from './dto/register-serials.dto';

/**
 * Storage + lifecycle helpers for `item_serials`. The Sales / Purchases /
 * Returns services lean on this — they own the high-level orchestration,
 * this module owns the row mutations + invariants.
 */
@Injectable()
export class ItemSerialsService {
  constructor(
    @InjectRepository(ItemSerial)
    private readonly repo: Repository<ItemSerial>,
  ) {}

  /**
   * Idempotently records IN_STOCK rows for a batch of serials on one item.
   * - serial already present on the same item → skipped (no-op)
   * - serial present on a different item        → 409
   * - serial present in any sold/returned state → 409 (re-using a manufacturer
   *   serial across two units is a data corruption, not a normal case)
   */
  async registerStock(
    dto: RegisterSerialsDto,
    manager?: EntityManager,
  ): Promise<ItemSerial[]> {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const trimmed = Array.from(
      new Set(dto.serials.map((s) => s.trim()).filter(Boolean)),
    );
    if (trimmed.length === 0) return [];

    const out: ItemSerial[] = [];
    for (const serial of trimmed) {
      const existing = await repo.findOne({ where: { serial } });
      if (existing) {
        if (existing.itemId !== dto.itemId) {
          throw new ConflictException(
            `Serial "${serial}" is already registered to a different item.`,
          );
        }
        // Same item, already known — skip silently (idempotent re-paste).
        out.push(existing);
        continue;
      }
      const row = repo.create({
        serial,
        itemId: dto.itemId,
        status: 'IN_STOCK',
        purchaseBillNo: dto.purchaseBillNo,
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : undefined,
        purchasePrice: dto.purchasePrice,
        currentStoreId: dto.currentStoreId,
      });
      out.push(await repo.save(row));
    }
    return out;
  }

  /**
   * Marks a serial as SOLD against a sale. If the serial isn't known yet,
   * creates it on the fly (purchase form may have skipped serials) — this
   * keeps the POS flow non-blocking. The created row carries no purchase
   * metadata; the next purchase that registers the same serial will fail
   * with a clear conflict, which is fine — operator decides.
   *
   * Warranty defaults pull from the Item: `hasWarranty` + `warrantyType` +
   * `warrantyDays`. Caller can override per-sale (extended warranty) but
   * usually doesn't.
   */
  async bindToSale(
    args: {
      serial: string;
      itemId: string;
      saleInvoiceNo: string;
      soldAt: Date;
      soldToCustomerId?: string;
      warrantyDays?: number;
      warrantyType?: string;
    },
    manager?: EntityManager,
  ): Promise<ItemSerial> {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const itemRepo = manager ? manager.getRepository(Item) : null;

    const serial = args.serial.trim();
    if (!serial) {
      throw new BadRequestException('Serial number is required.');
    }

    let row = await repo.findOne({ where: { serial } });
    if (row && row.itemId !== args.itemId) {
      throw new ConflictException(
        `Serial "${serial}" is registered to a different item.`,
      );
    }
    if (row && row.status === 'SOLD') {
      throw new ConflictException(
        `Serial "${serial}" is already sold (invoice ${row.saleInvoiceNo}).`,
      );
    }
    if (!row) {
      row = repo.create({
        serial,
        itemId: args.itemId,
        status: 'IN_STOCK',
      });
    }

    // Resolve warranty defaults from the Item if not overridden per-sale.
    let warrantyDays = args.warrantyDays;
    let warrantyType = args.warrantyType;
    if ((warrantyDays == null || warrantyType == null) && itemRepo) {
      const item = await itemRepo.findOne({ where: { id: args.itemId } });
      if (item) {
        if (warrantyDays == null) warrantyDays = item.warrantyDays ?? undefined;
        if (warrantyType == null) {
          warrantyType = item.hasWarranty ? item.warrantyType : undefined;
        }
      }
    }

    row.status = 'SOLD';
    row.saleInvoiceNo = args.saleInvoiceNo;
    row.soldAt = args.soldAt;
    row.soldToCustomerId = args.soldToCustomerId;
    row.warrantyStartAt = args.soldAt;
    row.warrantyDays = warrantyDays ?? undefined;
    row.warrantyType = warrantyType ?? undefined;
    if (warrantyDays != null) {
      const end = new Date(args.soldAt);
      end.setDate(end.getDate() + Number(warrantyDays));
      row.warrantyEndAt = end;
    } else {
      row.warrantyEndAt = undefined;
    }
    return repo.save(row);
  }

  /**
   * Sale-return flow: flips a SOLD serial back to RETURNED so warranty
   * lookups and "currently sold" reports treat it correctly. The history
   * (saleInvoiceNo, soldAt, warrantyEndAt) is preserved on the row.
   */
  async markReturned(serial: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const row = await repo.findOne({ where: { serial } });
    if (!row) throw new NotFoundException(`Serial "${serial}" not found.`);
    if (row.status !== 'SOLD') {
      throw new BadRequestException(
        `Serial "${serial}" is not currently sold — its status is ${row.status}.`,
      );
    }
    row.status = 'RETURNED';
    return repo.save(row);
  }

  /** Sale reversal: same as a return on every serial linked to the invoice. */
  async unbindFromInvoice(invoiceNo: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const rows = await repo.find({
      where: { saleInvoiceNo: invoiceNo, status: 'SOLD' },
    });
    for (const r of rows) {
      r.status = 'RETURNED';
    }
    if (rows.length > 0) await repo.save(rows);
    return rows.length;
  }

  /** Public warranty lookup. Returns only non-PII fields. */
  async lookupWarranty(serial: string) {
    const row = await this.repo.findOne({
      where: { serial: serial.trim() },
      relations: ['item'],
    });
    if (!row) return null;
    return {
      serial: row.serial,
      modelNo: row.item?.modelNo ?? row.item?.name ?? null,
      status: row.status,
      soldAt: row.soldAt ?? null,
      warrantyStartAt: row.warrantyStartAt ?? null,
      warrantyEndAt: row.warrantyEndAt ?? null,
      warrantyDays: row.warrantyDays ?? null,
      warrantyType: row.warrantyType ?? null,
      active:
        row.status === 'SOLD' &&
        row.warrantyEndAt != null &&
        row.warrantyEndAt > new Date() &&
        row.warrantyType !== 'NONE' &&
        row.warrantyType !== 'CHECKING_ONLY',
    };
  }

  /** Lists IN_STOCK serials for an item. POS picker uses this. */
  async listAvailableForItem(itemId: string) {
    return this.repo.find({
      where: { itemId, status: 'IN_STOCK' as ItemSerialStatus },
      order: { createdAt: 'ASC' },
    });
  }

  /** Full list, paginated implicitly via the AuditLog-style 500-row cap. */
  async list(query: {
    itemId?: string;
    status?: ItemSerialStatus;
    saleInvoiceNo?: string;
  }) {
    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.item', 'item')
      .orderBy('s.createdAt', 'DESC')
      .take(500);
    if (query.itemId) qb.andWhere('s.itemId = :itemId', { itemId: query.itemId });
    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    if (query.saleInvoiceNo) {
      qb.andWhere('s.saleInvoiceNo = :inv', { inv: query.saleInvoiceNo });
    }
    return qb.getMany();
  }
}
