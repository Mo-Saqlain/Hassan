import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * User-facing account flavours (Cash / Bank / Wallet / Capital / Credit) plus
 * system-managed bookkeeping accounts (Revenue / COGS / Inventory / A_R / A_P)
 * that the double-entry journal needs but the user doesn't manage directly.
 */
export type AccountType =
  | 'CASH'
  | 'BANK'
  | 'WALLET'
  | 'CAPITAL'
  | 'CREDIT'
  | 'REVENUE'
  | 'COGS'
  | 'INVENTORY'
  | 'A_R'
  | 'A_P'
  | 'CASH_ON_HAND';

/**
 * Financial-statement bucket. Income Statement reads INCOME + EXPENSE;
 * Balance Sheet reads ASSET + LIABILITY + EQUITY. Stored explicitly so the
 * journal-driven reports can group by it directly.
 */
export type AccountCategory =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'INCOME'
  | 'EXPENSE';

export type AccountSubType =
  | 'CURRENT_ASSET'
  | 'FIXED_ASSET'
  | 'INVENTORY_ASSET'
  | 'RECEIVABLE'
  | 'CURRENT_LIABILITY'
  | 'LONG_TERM_LIABILITY'
  | 'PAYABLE'
  | 'OWNERS_EQUITY'
  | 'RETAINED_EARNINGS'
  | 'OPERATING_INCOME'
  | 'OTHER_INCOME'
  | 'COGS'
  | 'OPERATING_EXPENSE'
  | 'OTHER_EXPENSE';

@Entity('accounts')
@Index(['accountCategory'])
@Index(['isSystem'])
@Index(['parentAccountId'])
@Index(['isControl'])
export class Account extends BaseEntity {
  @Column({ unique: true, nullable: true })
  code?: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: 'CASH' })
  type: AccountType;

  /** Five-way classification driving the financial statements. */
  @Column({
    type: 'varchar',
    name: 'account_category',
    default: 'ASSET',
  })
  accountCategory: AccountCategory;

  /** Refines `accountCategory` for the Balance Sheet grouping. */
  @Column({
    type: 'varchar',
    name: 'account_sub_type',
    nullable: true,
  })
  accountSubType?: AccountSubType;

  /**
   * Hierarchy pointer — control accounts (`isControl=true`) act as
   * grouping nodes in the chart of accounts. Their children are the
   * leaves that the journal actually posts to.
   */
  @Column({ name: 'parent_account_id', nullable: true })
  parentAccountId?: string;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_account_id' })
  parentAccount?: Account;

  /**
   * Control accounts cannot be posted to directly — `JournalService.post()`
   * rejects any line whose accountId points to one. They exist purely as
   * grouping/totalling nodes in the chart of accounts.
   */
  @Column({ default: false, name: 'is_control' })
  isControl: boolean;

  /**
   * System accounts (Revenue / COGS / Inventory / A_R / A_P / Cash on Hand)
   * are seeded on first boot and protected from delete. The user can rename
   * them but not remove them — they're the targets of every
   * JournalService.post() call.
   */
  @Column({ default: false, name: 'is_system' })
  isSystem: boolean;

  @Column({ name: 'account_number', nullable: true })
  accountNumber?: string;

  @Column({ nullable: true })
  bank?: string;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    default: 0,
    name: 'opening_balance',
  })
  openingBalance: number;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
