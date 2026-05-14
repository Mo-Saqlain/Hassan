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
import { Store } from '../../stores/entities/store.entity';
import { PurchaseItem } from './purchase-item.entity';

@Entity('purchases')
@Index(['billNo'], { unique: true })
@Index(['supplierId'])
@Index(['supplierId', 'createdAt'])
@Index(['storeId'])
@Index(['createdAt'])
export class Purchase extends BaseEntity {
  @Column({ name: 'bill_no' })
  billNo: string;

  @Column({ name: 'supplier_id', nullable: true })
  supplierId?: string;

  @ManyToOne(() => Supplier, { nullable: true, eager: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: Supplier;

  @Column({ name: 'store_id', nullable: true })
  storeId?: string;

  @ManyToOne(() => Store, { nullable: true, eager: true })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column('decimal', { precision: 14, scale: 2, name: 'total_amount', default: 0 })
  totalAmount: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  discount: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'net_amount', default: 0 })
  netAmount: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'paid_amount', default: 0 })
  paidAmount: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'due_amount', default: 0 })
  dueAmount: number;

  @Column({ name: 'payment_method', default: 'CASH' })
  paymentMethod: string;

  @Column({ nullable: true })
  notes?: string;

  @OneToMany(() => PurchaseItem, (line) => line.purchase, {
    cascade: true,
    eager: true,
  })
  lines: PurchaseItem[];
}
