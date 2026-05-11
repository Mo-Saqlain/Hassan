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

    const saleDto = {
      customerId: dto.customerId,
      storeId: session.storeId,
      discount: dto.discount ?? 0,
      paidAmount: dto.paidAmount,
      paymentMethod: dto.paymentMethod ?? 'CASH',
      notes: dto.notes,
      lines: cartLines.map((ln) => ({
        itemId: ln.itemId,
        quantity: ln.quantity,
        unitPrice: Number(ln.price),
      })),
    };

    // POS already enqueues its own POS_SALE_CREATED event below; tell the
    // SalesService to skip its own outbox enqueue so we don't double-push.
    const sale = await this.sales.create(saleDto as any, { skipOutbox: true });

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
