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
import { Sale } from '../../sales/entities/sale.entity';
import { SaleReturnItem } from './sale-return-item.entity';

@Entity('sale_returns')
@Index(['returnNo'], { unique: true })
@Index(['customerId'])
@Index(['saleId'])
@Index(['createdAt'])
export class SaleReturn extends BaseEntity {
  @Column({ name: 'return_no' })
  returnNo: string;

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

  @Column({ name: 'store_id', nullable: true })
  storeId?: string;

  @ManyToOne(() => Store, { nullable: true, eager: true })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column('decimal', { precision: 14, scale: 2, name: 'total_amount', default: 0 })
  totalAmount: number;

  @Column({ nullable: true })
  reason?: string;

  @OneToMany(() => SaleReturnItem, (line) => line.saleReturn, {
    cascade: true,
    eager: true,
  })
  lines: SaleReturnItem[];
}
