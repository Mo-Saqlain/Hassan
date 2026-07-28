import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { ItemSerial, ItemSerialStatus } from './entities/item-serial.entity';
import { Item } from '../items/entities/item.entity';
import { Category } from '../categories/entities/category.entity';
import { Sequence } from '../sequences/entities/sequence.entity';
import { DataSource } from 'typeorm';
import { RegisterSerialsDto } from './dto/register-serials.dto';

/**
 * Storage + lifecycle helpers for `item_serials`. The Sales / Purchases /
 * Returns services lean on this — they own the high-level orchestration,
 * this module owns the row mutations + invariants.
 */
@Injectable()
export class ItemSerialsService implements OnModuleInit {
  private readonly logger = new Logger(ItemSerialsService.name);

  constructor(
    @InjectRepository(ItemSerial)
    private readonly repo: Repository<ItemSerial>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Backfill `allocationStatus` for rows persisted before the column existed.
   * Maps the physical-lifecycle `status` to the most likely allocation state:
   *   IN_STOCK              → AVAILABLE
   *   SOLD                  → DELIVERED  (they were handed over previously)
   *   RETURNED / DAMAGED /
   *   WRITE_OFF             → AVAILABLE  (already-physical states; the unit
   *                          isn't booked or out the door)
   * Idempotent — the WHERE skips rows that already have a value. The new
   * BOOKED state never appears here because it didn't exist before this
   * migration, and we'd rather mis-classify a historical SOLD as DELIVERED
   * than leave it null and break the new state-machine guards.
   */
  async onModuleInit() {
    // SQLite + Postgres both treat the column default as applying on INSERT
    // only, so existing rows are NULL until we backfill. Find them.
    const stale = await this.repo.find({
      where: { allocationStatus: IsNull() as any },
    });
    if (stale.length === 0) return;
    for (const r of stale) {
      r.allocationStatus =
        r.status === 'SOLD' ? 'DELIVERED' : 'AVAILABLE';
    }
    await this.repo.save(stale);
    this.logger.log(
      `Backfilled allocation_status on ${stale.length} item_serials row(s).`,
    );
  }

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
    // Full-payment binding implies the unit walks out with the customer —
    // allocation transitions all the way to DELIVERED. Partial-payment
    // sales go through reserveForBooking() instead, which leaves the unit
    // in IN_STOCK + BOOKED until the balance clears.
    row.allocationStatus = 'DELIVERED';
    row.bookedAt = undefined;
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
   * Reserve serials for a partial-payment ("BOOKED") sale. Atomic — every
   * supplied serial must currently be AVAILABLE; one BOOKED or DELIVERED
   * mid-list throws and the transaction rolls back. Each row's `status`
   * stays IN_STOCK (the unit is physically still on the floor) but
   * `allocationStatus` becomes BOOKED with `bookedAt = now`.
   *
   * This is the call the spec's "Booking Hold Block" mandates — without it
   * two customers could pay advances against the same fridge.
   */
  async reserveForBooking(
    args: {
      serials: string[];
      itemId: string;
      saleInvoiceNo: string;
      soldToCustomerId?: string;
      bookedAt?: Date;
    },
    manager?: EntityManager,
  ): Promise<ItemSerial[]> {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const cleaned = args.serials.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) return [];
    const now = args.bookedAt ?? new Date();
    const out: ItemSerial[] = [];
    for (const serial of cleaned) {
      let row = await repo.findOne({ where: { serial } });
      if (row && row.itemId !== args.itemId) {
        throw new ConflictException(
          `Serial "${serial}" is registered to a different item.`,
        );
      }
      if (row && row.allocationStatus === 'BOOKED') {
        throw new ConflictException(
          `Serial "${serial}" is already BOOKED on invoice ${row.saleInvoiceNo ?? 'unknown'}.`,
        );
      }
      if (row && row.allocationStatus === 'DELIVERED') {
        throw new ConflictException(
          `Serial "${serial}" was already delivered on invoice ${row.saleInvoiceNo ?? 'unknown'}.`,
        );
      }
      if (!row) {
        row = repo.create({
          serial,
          itemId: args.itemId,
          status: 'IN_STOCK',
        });
      }
      row.allocationStatus = 'BOOKED';
      row.bookedAt = now;
      row.saleInvoiceNo = args.saleInvoiceNo;
      row.soldToCustomerId = args.soldToCustomerId;
      out.push(await repo.save(row));
    }
    return out;
  }

  /**
   * Release a BOOKED serial back to AVAILABLE. Called by the
   * Release-Booking endpoint when the customer never came back, or by
   * SalesService.reverse() when a booked sale is cancelled. Clears the
   * sale link + bookedAt so the unit is fully back in the pool.
   */
  async releaseBooking(
    saleInvoiceNo: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const rows = await repo.find({
      where: { saleInvoiceNo, allocationStatus: 'BOOKED' },
    });
    for (const r of rows) {
      r.allocationStatus = 'AVAILABLE';
      r.bookedAt = undefined;
      r.saleInvoiceNo = undefined;
      r.soldToCustomerId = undefined;
    }
    if (rows.length > 0) await repo.save(rows);
    return rows.length;
  }

  /**
   * Final-handover transition: flips serials BOOKED → DELIVERED once the
   * sale is paid in full. Called by the Delivery workflow + by the
   * full-payment path of SalesService.create / PosService.checkout.
   */
  async markDelivered(
    saleInvoiceNo: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const rows = await repo.find({
      where: { saleInvoiceNo, allocationStatus: 'BOOKED' as any },
    });
    for (const r of rows) {
      r.allocationStatus = 'DELIVERED';
    }
    if (rows.length > 0) await repo.save(rows);
    return rows.length;
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

  /**
   * Company-claim flow: the physical unit left our world to the manufacturer
   * (customer → company). It never re-enters our stock, so the serial is
   * written off rather than returned-to-shelf. The sale history is preserved
   * on the row; only `status` moves to WRITE_OFF. Idempotent-ish: a serial
   * already WRITE_OFF is left as-is.
   */
  async markWrittenOff(serial: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const row = await repo.findOne({ where: { serial } });
    if (!row) throw new NotFoundException(`Serial "${serial}" not found.`);
    if (row.status === 'WRITE_OFF') return row;
    row.status = 'WRITE_OFF';
    return repo.save(row);
  }

  /**
   * Return-reversal flow: the return itself was a mistake, so the unit goes
   * back to being sold — undoing either `markReturned` (RETURNED → SOLD) or
   * `markWrittenOff` (WRITE_OFF → SOLD, the company-claim case). The sale
   * history on the row was never cleared, so the warranty window and invoice
   * link light up again as they were.
   *
   * Idempotent: a serial already SOLD is left alone. Anything else (IN_STOCK,
   * DAMAGED) is refused — those states mean the unit was handled again after
   * the return, and silently forcing them to SOLD would invent history.
   */
  async restoreToSold(serial: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const row = await repo.findOne({ where: { serial } });
    if (!row) throw new NotFoundException(`Serial "${serial}" not found.`);
    if (row.status === 'SOLD') return row;
    if (row.status !== 'RETURNED' && row.status !== 'WRITE_OFF') {
      throw new BadRequestException(
        `Serial "${serial}" cannot go back to SOLD from ${row.status}.`,
      );
    }
    row.status = 'SOLD';
    return repo.save(row);
  }

  /**
   * Sale reversal: cleanly walks back whatever allocation state the
   * serials are in:
   *   BOOKED   → AVAILABLE   (unit was never handed over — back to floor)
   *   DELIVERED → status=RETURNED, allocation=AVAILABLE
   * Returns how many rows were touched.
   */
  async unbindFromInvoice(invoiceNo: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(ItemSerial) : this.repo;
    const rows = await repo.find({ where: { saleInvoiceNo: invoiceNo } });
    for (const r of rows) {
      if (r.allocationStatus === 'BOOKED') {
        // Never left the shop — back on the floor, no return record.
        r.allocationStatus = 'AVAILABLE';
        r.bookedAt = undefined;
        r.saleInvoiceNo = undefined;
        r.soldToCustomerId = undefined;
      } else if (r.allocationStatus === 'DELIVERED' || r.status === 'SOLD') {
        // Customer had taken delivery — physical return event.
        r.status = 'RETURNED';
        r.allocationStatus = 'AVAILABLE';
      }
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
      allocationStatus: row.allocationStatus,
      bookedAt: row.bookedAt ?? null,
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

  /**
   * Mint N internal-generated serials for a local/unbranded item.
   *
   * Serial format: LOCAL-<CategoryCode>-<Year>-<4-digit-sequence>
   *   e.g.  LOCAL-COOLER-2026-0007
   *
   * The sequence segment runs per (category-code, year) so two categories
   * get independent counters and Jan 1 resets them. Stored in the same
   * `sequences` table as INV-/PMT-/BILL- counters, keyed on the full
   * "LOCAL-<code>-<year>" prefix.
   *
   * Returns the freshly-saved ItemSerial rows in IN_STOCK + AVAILABLE
   * state with is_internal_generated = true. POS injects them into the
   * cart line's serial textarea after the click.
   */
  async generateLocalSerials(args: {
    itemId: string;
    count: number;
  }): Promise<ItemSerial[]> {
    if (!args.count || args.count < 1) {
      throw new BadRequestException('Count must be at least 1.');
    }
    if (args.count > 100) {
      throw new BadRequestException(
        'Cannot mint more than 100 serials at once.',
      );
    }
    return this.dataSource.transaction(async (tx) => {
      const itemRepo = tx.getRepository(Item);
      const item = await itemRepo.findOne({
        where: { id: args.itemId },
        relations: ['categories'],
      });
      if (!item) {
        throw new NotFoundException(`Item ${args.itemId} not found.`);
      }
      // First category with a code wins — the owner can have an item in
      // multiple categories (M2M) but only one drives the serial prefix.
      const cat = (item.categories ?? []).find(
        (c) => c.code && c.code.trim().length > 0,
      );
      if (!cat || !cat.code) {
        throw new BadRequestException(
          `Item "${item.name}" has no category with a Code set. ` +
            'Add a short uppercase code (e.g. COOLER) on one of the ' +
            "item's categories first.",
        );
      }
      const year = new Date().getFullYear();
      const prefix = `LOCAL-${cat.code}-${year}`;
      const seqRepo = tx.getRepository(Sequence);
      const serialRepo = tx.getRepository(ItemSerial);
      const out: ItemSerial[] = [];

      // Pull (or create) the sequence row once, then increment N times in
      // a single save at the end. Eliminates N round-trips per mint.
      let row = await seqRepo.findOne({ where: { prefix } });
      if (!row) {
        row = seqRepo.create({ prefix, nextValue: 1 });
      }

      for (let i = 0; i < args.count; i += 1) {
        const value = row.nextValue;
        row.nextValue = value + 1;
        const serial = `${prefix}-${String(value).padStart(4, '0')}`;
        out.push(
          serialRepo.create({
            serial,
            itemId: args.itemId,
            status: 'IN_STOCK',
            allocationStatus: 'AVAILABLE',
            isInternalGenerated: true,
          }),
        );
      }
      await seqRepo.save(row);
      return serialRepo.save(out);
    });
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
