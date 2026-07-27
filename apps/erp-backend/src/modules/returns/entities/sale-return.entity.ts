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
@Index(['replacementSaleId'])
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
   * What physically happens to the returned goods — orthogonal to the money
   * side (refund/credit). Decoupling these is deliberate: a return is two
   * independent facts, "the customer gave it back" and "where the unit went".
   *   • RESTOCK (default)         → goods re-enter our sellable on-hand
   *                                 (stock IN + costedQty bump); serial → RETURNED.
   *   • CLAIMED_TO_COMPANY        → the unit left our world to the manufacturer
   *                                 (a warranty claim). NO stock IN, NO costedQty
   *                                 change — it never hits our shelf; serial →
   *                                 WRITE_OFF. The customer is still credited.
   */
  @Column({ name: 'disposition', default: 'RESTOCK' })
  disposition: 'RESTOCK' | 'CLAIMED_TO_COMPANY';

  /**
   * When this return is the give-back leg of an exchange, the new Sale the
   * customer walked out with. Lets the exchange be traced both ways.
   */
  @Column({ name: 'replacement_sale_id', nullable: true })
  replacementSaleId?: string;

  /**
   * If the customer was refunded in CASH (or bank/wallet), the account the
   * money went out of. Null = no monetary refund (goods came back against
   * store credit / a reduction of the customer's outstanding balance). When
   * set to a CASH account, the daily cash book counts `refundAmount` as an
   * OUT so the till reconciles.
   *
   * A/R impact: a return credits the customer ledger by the STORE-CREDIT
   * portion only — `totalAmount − refundAmount`. The refunded cash already
   * left via the till, so it must NOT also credit A/R (that would push the
   * balance falsely negative). See ReportsService.customerLedger /
   * allCustomerBalances. Still no journal entry is posted (returns are
   * operational-only; the journal-derived reports don't see returns yet).
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
