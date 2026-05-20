import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { ItemSerial } from '../../item-serials/entities/item-serial.entity';

/**
 * Repair / warranty-claim workflow. One row per unit a customer drops off
 * for service. Status walks the standard Pakistani appliance-shop path —
 * received → diagnostics → either to the company or in-house repair → ready
 * → out. UNREPAIRABLE is a terminal state for write-offs.
 *
 * Optional links to `item_serial` and `sale_invoice_no` let the warranty
 * lookup surface "in service since X" alongside the cover info. The link
 * is soft (no FK constraints) because returns / reversals can detach a
 * serial from its original sale.
 */
export type ServiceTicketStatus =
  | 'RECEIVED'
  | 'SENT_TO_COMPANY'
  | 'WAITING_PARTS'
  | 'UNDER_REPAIR'
  | 'READY_FOR_PICKUP'
  | 'DELIVERED'
  | 'UNREPAIRABLE';

@Entity('service_tickets')
@Index(['ticketNo'], { unique: true })
@Index(['status'])
@Index(['customerId'])
@Index(['itemSerialId'])
@Index(['receivedAt'])
export class ServiceTicket extends BaseEntity {
  @Column({ name: 'ticket_no' })
  ticketNo: string;

  @Column({ name: 'customer_id', nullable: true })
  customerId?: string;

  @ManyToOne(() => Customer, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  /** Soft link — populated when the unit was sold through us and the
   *  customer remembers / brings the serial. Drives the in-warranty flag. */
  @Column({ name: 'item_serial_id', nullable: true })
  itemSerialId?: string;

  @ManyToOne(() => ItemSerial, { nullable: true, eager: true })
  @JoinColumn({ name: 'item_serial_id' })
  itemSerial?: ItemSerial;

  /** Manually-typed item description for cases where the serial isn't
   *  known (older unit, lost label, gray-market). Either this or
   *  `itemSerial` must be set; both is fine. */
  @Column({ name: 'item_description', nullable: true })
  itemDescription?: string;

  @Column({ type: 'text' })
  complaint: string;

  /** Snapshot of the in-warranty status when the ticket opened. Useful for
   *  reports — a unit can go out of warranty between receipt and pickup,
   *  but the cost/recovery decision was made at receipt time. */
  @Column({ name: 'in_warranty', default: false })
  inWarranty: boolean;

  @Column({ type: 'varchar', default: 'RECEIVED' })
  status: ServiceTicketStatus;

  @Column({ name: 'received_at', type: Date })
  receivedAt: Date;

  @Column({ name: 'estimated_completion', type: Date, nullable: true })
  estimatedCompletion?: Date;

  @Column({ name: 'delivered_at', type: Date, nullable: true })
  deliveredAt?: Date;

  @Column({ name: 'technician_notes', type: 'text', nullable: true })
  technicianNotes?: string;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes?: string;

  /** Cost estimate quoted to the customer at receipt time. Out-of-warranty
   *  tickets typically have a non-zero value here. */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'estimated_cost',
    nullable: true,
  })
  estimatedCost?: number;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'actual_cost',
    nullable: true,
  })
  actualCost?: number;
}
