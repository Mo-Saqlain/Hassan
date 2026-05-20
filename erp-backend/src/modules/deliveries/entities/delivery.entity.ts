import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { Customer } from '../../customers/entities/customer.entity';

/**
 * Delivery is operational tracking only. Stock is already deducted at sale
 * time — this entity tracks the physical handover (truck out, customer
 * signature in). The only inventory effect is the reservation overlay:
 * a sale's units are "reserved" (counted as not-available) from creation
 * until the delivery flips to DELIVERED or CANCELLED.
 */
export type DeliveryStatus =
  | 'PENDING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'INSTALLATION_PENDING'
  | 'INSTALLED'
  | 'CANCELLED';

/** Statuses that still hold inventory reservation. */
export const RESERVING_STATUSES: DeliveryStatus[] = [
  'PENDING',
  'OUT_FOR_DELIVERY',
  'INSTALLATION_PENDING',
];

@Entity('deliveries')
@Index(['deliveryNo'], { unique: true })
@Index(['status'])
@Index(['saleId'])
@Index(['scheduledFor'])
export class Delivery extends BaseEntity {
  @Column({ name: 'delivery_no' })
  deliveryNo: string;

  @Column({ name: 'sale_id', nullable: true })
  saleId?: string;

  @ManyToOne(() => Sale, { nullable: true, eager: true })
  @JoinColumn({ name: 'sale_id' })
  sale?: Sale;

  @Column({ name: 'customer_id', nullable: true })
  customerId?: string;

  @ManyToOne(() => Customer, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ name: 'assigned_to', nullable: true })
  assignedTo?: string;

  @Column({ name: 'vehicle', nullable: true })
  vehicle?: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: DeliveryStatus;

  @Column({ name: 'scheduled_for', type: Date, nullable: true })
  scheduledFor?: Date;

  @Column({ name: 'delivered_at', type: Date, nullable: true })
  deliveredAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
