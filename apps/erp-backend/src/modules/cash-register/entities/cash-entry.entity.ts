import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Account } from '../../accounts/entities/account.entity';

export type CashDirection = 'IN' | 'OUT';

/**
 * Daily cash-book entries. Pure cash movements only — sales/purchases/payments
 * already flow through their own tables. This sits next to them as the
 * shopkeeper's till book: small expenses, wallet top-ups, miscellaneous, etc.
 */
export type CashCategory =
  | 'OPENING'
  | 'CLOSING_ADJUSTMENT'
  | 'WALLET_TRANSFER_IN'
  | 'WALLET_TRANSFER_OUT'
  | 'EXPENSE'
  | 'MISC'
  | 'OTHER';

@Entity('cash_entries')
@Index(['entryDate'])
@Index(['accountId'])
@Index(['counterpartyAccountId'])
@Index(['direction'])
export class CashEntry extends BaseEntity {
  @Column({ name: 'entry_date', type: 'date' })
  entryDate: string;

  @Column({ type: 'varchar' })
  direction: CashDirection;

  @Column({ type: 'varchar' })
  category: CashCategory;

  @Column('decimal', { precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'account_id', nullable: true })
  accountId?: string;

  @ManyToOne(() => Account, { nullable: true, eager: true })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @Column({ name: 'counterparty_account_id', nullable: true })
  counterpartyAccountId?: string;

  @ManyToOne(() => Account, { nullable: true, eager: true })
  @JoinColumn({ name: 'counterparty_account_id' })
  counterpartyAccount?: Account;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  notes?: string;
}
