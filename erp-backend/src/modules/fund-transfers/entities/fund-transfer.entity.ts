import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Account } from '../../accounts/entities/account.entity';

/**
 * Treasury transfer between two accounts (Capital → Cash, Cash → Bank,
 * Bank → Credit card, etc.). Pure movement of own funds — never a
 * customer/supplier transaction. Pairs neatly with `payments` for
 * computing per-account balances.
 */
@Entity('fund_transfers')
@Index(['transferNo'], { unique: true })
@Index(['transferDate'])
@Index(['fromAccountId'])
@Index(['toAccountId'])
export class FundTransfer extends BaseEntity {
  @Column({ name: 'transfer_no' })
  transferNo: string;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate: string;

  @Column({ name: 'from_account_id' })
  fromAccountId: string;

  @ManyToOne(() => Account, { eager: true })
  @JoinColumn({ name: 'from_account_id' })
  fromAccount: Account;

  @Column({ name: 'to_account_id' })
  toAccountId: string;

  @ManyToOne(() => Account, { eager: true })
  @JoinColumn({ name: 'to_account_id' })
  toAccount: Account;

  @Column('decimal', { precision: 14, scale: 2 })
  amount: number;

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
