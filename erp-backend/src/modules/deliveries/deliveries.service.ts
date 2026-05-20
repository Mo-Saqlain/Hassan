import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  Delivery,
  DeliveryStatus,
  RESERVING_STATUSES,
} from './entities/delivery.entity';
import {
  CreateDeliveryDto,
  UpdateDeliveryDto,
} from './dto/create-delivery.dto';
import { SequenceService } from '../sequences/sequence.service';
import { Sale } from '../sales/entities/sale.entity';
import { Item } from '../items/entities/item.entity';

/** True iff the status keeps stock reserved (not yet handed over). */
function reserves(status: DeliveryStatus): boolean {
  return RESERVING_STATUSES.includes(status);
}

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(Delivery)
    private readonly repo: Repository<Delivery>,
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    private readonly sequences: SequenceService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateDeliveryDto) {
    return this.dataSource.transaction(async (manager) => {
      const deliveryRepo = manager.getRepository(Delivery);
      const deliveryNo = await this.sequences.next('DLV', () =>
        deliveryRepo.count(),
      );

      // Auto-fill customer / address from the linked sale when the operator
      // skipped them — saves a roundtrip and reduces input errors.
      let { customerId, address, phone } = dto;
      if (dto.saleId) {
        const sale = await manager
          .getRepository(Sale)
          .findOne({ where: { id: dto.saleId } });
        if (!sale) {
          throw new NotFoundException(`Sale ${dto.saleId} not found`);
        }
        customerId = customerId ?? sale.customerId;
        if (!phone && sale.customer?.phone) phone = sale.customer.phone;
        if (!address && sale.customer?.address) address = sale.customer.address;
      }

      const row = deliveryRepo.create({
        ...dto,
        customerId,
        address,
        phone,
        deliveryNo,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
        status: dto.status ?? 'PENDING',
      });
      const saved = await deliveryRepo.save(row);

      if (reserves(saved.status)) {
        await this.applyReservation(manager, saved, +1);
      }
      return saved;
    });
  }

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 500 });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Delivery ${id} not found`);
    return row;
  }

  async update(id: string, dto: UpdateDeliveryDto) {
    return this.dataSource.transaction(async (manager) => {
      const deliveryRepo = manager.getRepository(Delivery);
      const row = await deliveryRepo.findOne({ where: { id } });
      if (!row) throw new NotFoundException(`Delivery ${id} not found`);
      const wasReserving = reserves(row.status);
      const nextStatus = dto.status ?? row.status;
      const willReserve = reserves(nextStatus);

      Object.assign(row, dto);
      if (dto.scheduledFor) row.scheduledFor = new Date(dto.scheduledFor);
      if (nextStatus === 'DELIVERED' && !row.deliveredAt) {
        row.deliveredAt = new Date();
      }
      const saved = await deliveryRepo.save(row);

      // Status transition flips reservation: if we held a reservation but
      // shouldn't anymore, release it; vice-versa.
      if (wasReserving && !willReserve) {
        await this.applyReservation(manager, saved, -1);
      } else if (!wasReserving && willReserve) {
        await this.applyReservation(manager, saved, +1);
      }
      return saved;
    });
  }

  async remove(id: string) {
    return this.dataSource.transaction(async (manager) => {
      const deliveryRepo = manager.getRepository(Delivery);
      const row = await deliveryRepo.findOne({ where: { id } });
      if (!row) throw new NotFoundException(`Delivery ${id} not found`);
      if (reserves(row.status)) {
        await this.applyReservation(manager, row, -1);
      }
      await deliveryRepo.remove(row);
      return { deleted: true, id };
    });
  }

  /**
   * Increment (`+1`) or decrement (`-1`) the reserved-qty overlay on every
   * Item that's part of this delivery's linked sale. Without a saleId we
   * have no line list to reserve against — those deliveries are "loose"
   * operational records (e.g. a courier pickup for a service ticket) and
   * skip the inventory hook.
   */
  private async applyReservation(
    manager: any,
    delivery: Delivery,
    sign: 1 | -1,
  ) {
    if (!delivery.saleId) return;
    const itemRepo = manager.getRepository(Item);
    const sale = await manager
      .getRepository(Sale)
      .findOne({ where: { id: delivery.saleId }, relations: ['lines'] });
    if (!sale || !sale.lines) return;
    // Aggregate by itemId so we touch each row once even when the sale has
    // multiple lines of the same SKU.
    const totals = new Map<string, number>();
    for (const ln of sale.lines) {
      totals.set(
        ln.itemId,
        (totals.get(ln.itemId) ?? 0) + Number(ln.quantity),
      );
    }
    const ids = Array.from(totals.keys());
    if (ids.length === 0) return;
    const items = await itemRepo.find({ where: { id: In(ids) } });
    for (const it of items) {
      const delta = (totals.get(it.id) ?? 0) * sign;
      it.reservedQty = Math.max(0, Number(it.reservedQty) + delta);
      await itemRepo.save(it);
    }
  }
}
