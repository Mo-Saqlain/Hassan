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

/**
 * One row of a sale's deferred-cash schedule. Embedded as JSON on the Sale.
 * `receiptVoucherNo` links to the Payment voucher that actually settled the
 * commitment so the customer ledger and the sale row agree.
 */
export interface SalePaymentCommitment {
  dueDate: string; // ISO YYYY-MM-DD
  expectedAmount: number;
  status: 'PENDING' | 'PAID';
  actualPaymentDate?: string;
  actualAmount?: number;
  receiptVoucherNo?: string;
  notes?: string;
}

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

  /**
   * Deferred-cash commitments captured at POS for "pay half now, half on
   * the 20th" sales. Stored as a JSON array (better-sqlite3 + Postgres both
   * support `simple-json`) — typically one entry but supports N if the
   * customer agrees to a split. When this array is empty and `dueAmount > 0`
   * the residual is plain A/R (open-ended credit, no promise). When at least
   * one entry exists, the unpaid amount lands on the Deferred Cash
   * Receivables system account instead of A/R, so the dashboard widget can
   * surface it as scheduled cash.
   *
   * Settlement happens via POST /sales/:id/settle-commitment — the endpoint
   * creates a normal Receipt voucher, updates `amountPaidSettled`, flips the
   * matched entry's status, and posts the second journal half.
   */
  @Column({
    type: 'simple-json',
    name: 'payment_commitments',
    nullable: true,
  })
  paymentCommitments?: SalePaymentCommitment[];

  /**
   * Cumulative cash actually received against this sale — paid-at-sale plus
   * every settled commitment. Initialised to `paidAmount` on create; bumped
   * by `settleCommitment()`.
   */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'amount_paid_settled',
    default: 0,
  })
  amountPaidSettled: number;

  /**
   * Reversal metadata. A non-null `reversedAt` means this sale has been voided
   * via `POST /sales/:id/reverse`; the row stays visible in history with a
   * REVERSED chip and is netted out by the reports. The balancing journal
   * entry is linked via `journal_entries.reverses_journal_entry_id`.
   */
  @Column({ name: 'reversed_at', type: Date, nullable: true })
  reversedAt?: Date;

  @Column({ name: 'reversed_by', nullable: true })
  reversedBy?: string;

  @Column({ name: 'reversal_reason', nullable: true })
  reversalReason?: string;

  @OneToMany(() => SaleItem, (line) => line.sale, {
    cascade: true,
    eager: true,
  })
  lines: SaleItem[];
}
