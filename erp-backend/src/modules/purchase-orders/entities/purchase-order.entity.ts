import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED';

@Entity('purchase_orders')
@Index(['poNo'], { unique: true })
@Index(['status'])
export class PurchaseOrder extends BaseEntity {
  @Column({ name: 'po_no' })
  poNo: string;

  @Column({ name: 'supplier_id' })
  supplierId: string;

  @ManyToOne(() => Supplier, { eager: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'order_date', type: 'date' })
  orderDate: string;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate?: string;

  @Column({ type: 'varchar', default: 'DRAFT' })
  status: PurchaseOrderStatus;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'total_amount',
    default: 0,
  })
  totalAmount: number;

  @Column({ nullable: true })
  notes?: string;

  @OneToMany(() => PurchaseOrderItem, (line) => line.purchaseOrder, {
    cascade: true,
    eager: true,
  })
  lines: PurchaseOrderItem[];
}
