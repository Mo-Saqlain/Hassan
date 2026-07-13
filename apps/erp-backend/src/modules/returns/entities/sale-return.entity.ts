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
import { Sale } from '../../sales/entities/sale.entity';
import { SaleReturnItem } from './sale-return-item.entity';

@Entity('sale_returns')
@Index(['returnNo'], { unique: true })
@Index(['customerId'])
@Index(['saleId'])
@Index(['createdAt'])
@Index(['refundAccountId'])
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

  /**
   * If the customer was refunded in CASH (or bank/wallet), the account the
   * money went out of. Null = no monetary refund (goods came back against
   * store credit / a reduction of the customer's outstanding balance). When
   * set to a CASH account, the daily cash book counts `refundAmount` as an
   * OUT so the till reconciles. Purely a cash-tracking overlay — it does NOT
   * post a journal or alter the A/R netting the customer ledger already does.
   */
  @Column({ name: 'refund_account_id', nullable: true })
  refundAccountId?: string;

  @ManyToOne(() => Account, { nullable: true, eager: true })
  @JoinColumn({ name: 'refund_account_id' })
  refundAccount?: Account;

  /** Cash actually refunded. Defaults to totalAmount when a refund account is
   *  set but no explicit amount is given (see ReturnsService). */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'refund_amount',
    nullable: true,
  })
  refundAmount?: number;

  @Column({ nullable: true })
  reason?: string;

  @OneToMany(() => SaleReturnItem, (line) => line.saleReturn, {
    cascade: true,
    eager: true,
  })
  lines: SaleReturnItem[];
}
