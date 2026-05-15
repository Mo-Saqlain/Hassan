import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Account } from '../../accounts/entities/account.entity';
import { JournalEntry } from './journal-entry.entity';

/**
 * A single debit or credit line within a journal entry. Exactly one of
 * `debit` or `credit` is positive per line; the other is zero. The CHECK
 * constraint is enforced in `JournalService.post()` rather than as a
 * dialect-specific SQL CHECK so SQLite and Postgres behave identically.
 */
@Entity('journal_lines')
@Index(['entryId'])
@Index(['accountId'])
export class JournalLine extends BaseEntity {
  @Column({ name: 'entry_id' })
  entryId: string;

  @ManyToOne(() => JournalEntry, (e) => e.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: JournalEntry;

  @Column({ name: 'account_id' })
  accountId: string;

  @ManyToOne(() => Account, { eager: false })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  debit: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  credit: number;

  @Column({ nullable: true })
  narration?: string;
}
