import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Store } from '../../stores/entities/store.entity';
import { Account } from '../../accounts/entities/account.entity';
import { SaleItem } from './sale-item.entity';

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK' | 'CREDIT';

@Entity('sales')
@Index(['invoiceNo'], { unique: true })
@Index(['customerId'])
@Index(['customerId', 'createdAt'])
@Index(['storeId'])
@Index(['createdAt'])
export class Sale extends BaseEntity {
  @Column({ name: 'invoice_no' })
  invoiceNo: string;

  @Column({ name: 'customer_id', nullable: true })
  customerId?: string;

  @ManyToOne(() => Customer, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

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
  paymentMethod: PaymentMethod;

  @Column({ name: 'account_id', nullable: true })
  accountId?: string;

  @ManyToOne(() => Account, { nullable: true, eager: true })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @Column({ nullable: true })
  notes?: string;

  @OneToMany(() => SaleItem, (line) => line.sale, {
    cascade: true,
    eager: true,
  })
  lines: SaleItem[];
}
