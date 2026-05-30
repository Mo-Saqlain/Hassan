import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosSession } from './entities/pos-session.entity';
import { PosCartItem } from './entities/pos-cart-item.entity';
import { Item } from '../items/entities/item.entity';
import { ItemsService } from '../items/items.service';
import { SalesService } from '../sales/sales.service';
import { OutboxService } from '../outbox/outbox.service';
import { ItemSerialsService } from '../item-serials/item-serials.service';
import { StartSessionDto } from './dto/start-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class PosService {
  constructor(
    @InjectRepository(PosSession)
    private readonly sessions: Repository<PosSession>,
    @InjectRepository(PosCartItem)
    private readonly cart: Repository<PosCartItem>,
    private readonly items: ItemsService,
    private readonly sales: SalesService,
    private readonly outbox: OutboxService,
    private readonly itemSerials: ItemSerialsService,
    @InjectRepository(Item)
    private readonly itemsRepo: Repository<Item>,
  ) {}

  // ─── Sessions ─────────────────────────────────────────────
  async startSession(dto: StartSessionDto) {
    return this.sessions.save(
      this.sessions.create({
        storeId: dto.storeId,
        userId: dto.userId,
        openingFloat: dto.openingFloat ?? 0,
        status: 'ACTIVE',
      }),
    );
  }

  async closeSession(id: string, dto: CloseSessionDto) {
    const s = await this.findSession(id);
    if (s.status === 'CLOSED') {
      throw new BadRequestException('Session is already closed');
    }
    s.status = 'CLOSED';
    s.endedAt = new Date();
    s.closingAmount = dto.closingAmount ?? Number(s.salesTotal);
    const saved = await this.sessions.save(s);
    // Outbox event so the cloud can mirror session lifecycle
    if (process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('POS_SESSION_CLOSED', {
        sessionId: saved.id,
        endedAt: saved.endedAt,
        salesTotal: saved.salesTotal,
        salesCount: saved.salesCount,
        closingAmount: saved.closingAmount,
      });
    }
    return saved;
  }

  listSessions() {
    return this.sessions.find({ order: { startedAt: 'DESC' }, take: 100 });
  }

  async getActiveSession() {
    return this.sessions.findOne({
      where: { status: 'ACTIVE' },
      order: { startedAt: 'DESC' },
    });
  }

  async findSession(id: string) {
    const s = await this.sessions.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Session ${id} not found`);
    return s;
  }

  // ─── Cart ─────────────────────────────────────────────────
  async listCart(sessionId: string) {
    await this.assertActive(sessionId);
    return this.cart.find({
      where: { sessionId },
      order: { addedAt: 'ASC' },
    });
  }

  async addToCart(sessionId: string, dto: AddToCartDto) {
    await this.assertActive(sessionId);
    const item = await this.items.findByCode(dto.code);
    const qty = dto.quantity ?? 1;
    const price = dto.price ?? Number(item.salePrice);

    // If the same item is already in the cart, stack it instead of duplicating.
    const existing = await this.cart.findOne({
      where: { sessionId, itemId: item.id },
    });
    if (existing) {
      existing.quantity += qty;
      existing.price = price;
      existing.total = Number((existing.price * existing.quantity).toFixed(2));
      return this.cart.save(existing);
    }

    return this.cart.save(
      this.cart.create({
        sessionId,
        itemId: item.id,
        quantity: qty,
        price,
        total: Number((price * qty).toFixed(2)),
      }),
    );
  }

  async updateCartItem(cartItemId: string, dto: UpdateCartItemDto) {
    const line = await this.cart.findOne({ where: { id: cartItemId } });
    if (!line) throw new NotFoundException(`Cart item ${cartItemId} not found`);
    if (dto.quantity != null) line.quantity = dto.quantity;
    if (dto.price != null) line.price = dto.price;
    line.total = Number((Number(line.price) * line.quantity).toFixed(2));
    return this.cart.save(line);
  }

  async removeCartItem(cartItemId: string) {
    const line = await this.cart.findOne({ where: { id: cartItemId } });
    if (!line) throw new NotFoundException(`Cart item ${cartItemId} not found`);
    await this.cart.remove(line);
    return { deleted: true, id: cartItemId };
  }

  async clearCart(sessionId: string) {
    await this.cart.delete({ sessionId });
    return { cleared: true, sessionId };
  }

  // ─── Checkout ─────────────────────────────────────────────
  async checkout(sessionId: string, dto: CheckoutDto) {
    const session = await this.assertActive(sessionId);
    const cartLines = await this.cart.find({ where: { sessionId } });
    if (cartLines.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const paymentMethod = dto.paymentMethod ?? 'CASH';
    // A partial payment leaves a positive due amount → it must land on a
    // specific customer's A/R, otherwise the receivable is orphaned.
    if (
      dto.paidAmount != null &&
      !dto.customerId &&
      paymentMethod !== 'CREDIT'
    ) {
      const cartTotal = cartLines.reduce(
        (s, l) => s + Number(l.total),
        0,
      );
      const net = Math.max(0, cartTotal - (dto.discount ?? 0));
      if (Number(dto.paidAmount) < net) {
        throw new BadRequestException(
          'Select a customer for partial payments — the unpaid balance must be tracked as a receivable.',
        );
      }
    }
    if (paymentMethod === 'CREDIT' && !dto.customerId) {
      throw new BadRequestException(
        'Select a customer for CREDIT sales so the receivable is tracked.',
      );
    }

    // Serial-tracking validation. Three modes per item:
    //   - tracksSerials=false                       → ignore serial map entirely
    //   - tracksSerials=true, serialRequiredOnSale=false → optional capture, accept
    //     whatever the salesman provided (0..N entries)
    //   - tracksSerials=true, serialRequiredOnSale=true  → strict: one serial per
    //     unit, duplicates rejected
    const itemIds = Array.from(new Set(cartLines.map((l) => l.itemId)));
    const itemsByCart = await this.itemsRepo.find({
      where: itemIds.map((id) => ({ id })),
    });
    const itemMap = new Map(itemsByCart.map((i) => [i.id, i]));
    const serialMap = new Map<string, string[]>();
    for (const b of dto.serials ?? []) {
      const cleaned = b.serials.map((s) => s.trim()).filter(Boolean);
      serialMap.set(b.itemId, cleaned);
    }
    for (const ln of cartLines) {
      const it = itemMap.get(ln.itemId);
      if (!it || !it.tracksSerials) continue;
      const provided = serialMap.get(ln.itemId) ?? [];
      if (it.serialRequiredOnSale) {
        if (provided.length !== ln.quantity) {
          throw new BadRequestException(
            `${it.name}: ${ln.quantity} serial number${ln.quantity === 1 ? '' : 's'} required (got ${provided.length}). Scan or type one serial per unit on the cart row.`,
          );
        }
      } else {
        // Optional mode: accept partial / empty, but if anything was supplied
        // it must cover full units (no half-serials).
        if (provided.length > 0 && provided.length !== ln.quantity) {
          throw new BadRequestException(
            `${it.name}: either provide ${ln.quantity} serial${ln.quantity === 1 ? '' : 's'} (one per unit) or leave the box empty.`,
          );
        }
      }
      // Reject duplicates inside one checkout — two units in the same cart
      // can't share a serial.
      if (provided.length > 0 && new Set(provided).size !== provided.length) {
        throw new BadRequestException(
          `${it.name}: duplicate serial numbers in the cart row.`,
        );
      }
    }

    const saleDto = {
      customerId: dto.customerId,
      storeId: session.storeId,
      discount: dto.discount ?? 0,
      paidAmount: paymentMethod === 'CREDIT' ? 0 : dto.paidAmount,
      paymentMethod,
      accountId: paymentMethod === 'CREDIT' ? undefined : dto.accountId,
      notes: dto.notes,
      expectedPaymentDate: dto.expectedPaymentDate,
      lines: cartLines.map((ln) => ({
        itemId: ln.itemId,
        quantity: ln.quantity,
        unitPrice: Number(ln.price),
      })),
    };

    // POS already enqueues its own POS_SALE_CREATED event below; tell the
    // SalesService to skip its own outbox enqueue so we don't double-push.
    const sale = await this.sales.create(saleDto as any, { skipOutbox: true });

    // Bind every tracksSerials cart line's serials to the sale. Done after
    // the sale persists because we need the invoice number.
    //
    // Two paths depending on payment status:
    //   - Sale fully paid (dueAmount = 0): bindToSale flips serial to
    //     allocationStatus=DELIVERED and stamps warranty.
    //   - Sale partially paid (dueAmount > 0): the unit is BOOKED on hold;
    //     reserveForBooking flips to allocationStatus=BOOKED, leaves
    //     status=IN_STOCK. Warranty is stamped only when the balance
    //     clears via settleCommitment (handled by SalesService).
    const dueAmount = Number(sale.dueAmount ?? 0);
    const isBooking = dueAmount > 0.005;
    for (const ln of cartLines) {
      const it = itemMap.get(ln.itemId);
      if (!it || !it.tracksSerials) continue;
      const provided = serialMap.get(ln.itemId) ?? [];
      if (provided.length === 0) continue;
      if (isBooking) {
        await this.itemSerials.reserveForBooking({
          serials: provided,
          itemId: ln.itemId,
          saleInvoiceNo: sale.invoiceNo,
          soldToCustomerId: dto.customerId,
          bookedAt: sale.createdAt,
        });
      } else {
        for (const serial of provided) {
          await this.itemSerials.bindToSale({
            serial,
            itemId: ln.itemId,
            saleInvoiceNo: sale.invoiceNo,
            soldAt: sale.createdAt,
            soldToCustomerId: dto.customerId,
            warrantyDays: it.hasWarranty
              ? it.warrantyDays ?? undefined
              : undefined,
            warrantyType: it.hasWarranty ? it.warrantyType : undefined,
          });
        }
      }
    }

    // Update session running totals.
    session.salesTotal = Number(
      (Number(session.salesTotal) + Number(sale.netAmount)).toFixed(2),
    );
    session.salesCount += 1;
    await this.sessions.save(session);

    await this.clearCart(sessionId);

    if (process.env.CLOUD_SYNC_URL) {
      await this.outbox.enqueue('POS_SALE_CREATED', {
        sessionId,
        invoiceNo: sale.invoiceNo,
        ...saleDto,
      });
    }

    return sale;
  }

  // ─── Helpers ──────────────────────────────────────────────
  private async assertActive(sessionId: string): Promise<PosSession> {
    const s = await this.findSession(sessionId);
    if (s.status !== 'ACTIVE') {
      throw new BadRequestException(`Session ${sessionId} is not active`);
    }
    return s;
  }

  // Convenience: look up an item by SKU/barcode for the POS UI.
  async lookupItem(code: string): Promise<Item> {
    return this.items.findByCode(code);
  }
}
