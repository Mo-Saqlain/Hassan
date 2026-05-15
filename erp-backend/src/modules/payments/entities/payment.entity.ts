import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Account } from '../../accounts/entities/account.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

/** OUT = payment to supplier; IN = receipt from customer */
export type PaymentDirection = 'IN' | 'OUT';

@Entity('payments')
@Index(['voucherNo'], { unique: true })
@Index(['direction', 'customerId'])
@Index(['direction', 'supplierId'])
@Index(['accountId'])
@Index(['customerId'])
@Index(['supplierId'])
@Index(['createdAt'])
export class Payment extends BaseEntity {
  @Column({ name: 'voucher_no' })
  voucherNo: string;

  @Column({ type: 'varchar' })
  direction: PaymentDirection;

  @Column({ name: 'account_id' })
  accountId: string;

  @ManyToOne(() => Account, { eager: true })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'customer_id', nullable: true })
  customerId?: string;

  @ManyToOne(() => Customer, { nullable: true, eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ name: 'supplier_id', nullable: true })
  supplierId?: string;

  @ManyToOne(() => Supplier, { nullable: true, eager: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: Supplier;

  @Column('decimal', { precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'reference_id', nullable: true })
  referenceId?: string;

  @Column({ name: 'reference_type', nullable: true })
  referenceType?: string;

  @Column({ nullable: true })
  notes?: string;

  /** Reversal metadata — see Sale.reversedAt for the convention. */
  @Column({ name: 'reversed_at', type: Date, nullable: true })
  reversedAt?: Date;

  @Column({ name: 'reversed_by', nullable: true })
  reversedBy?: string;

  @Column({ name: 'reversal_reason', nullable: true })
  reversalReason?: string;
}
