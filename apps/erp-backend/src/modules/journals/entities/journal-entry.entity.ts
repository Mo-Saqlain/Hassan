import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { JournalLine } from './journal-line.entity';

export type JournalSourceModule =
  | 'SALE'
  | 'PURCHASE'
  | 'RECEIPT'
  | 'PAYMENT'
  | 'FUND_TRANSFER'
  | 'PAYROLL'
  | 'INCENTIVE_AWARD'
  | 'ADJUSTMENT'
  | 'OPENING_BALANCE'
  | 'REVERSAL';

/**
 * The header for a single double-entry posting. Every line under it (see
 * `JournalLine`) carries a debit and a credit; the invariant enforced by
 * `JournalService.post()` is `SUM(debit) === SUM(credit)`.
 *
 * `sourceModule` + `sourceRef` form a "where did this come from" pointer
 * (e.g. SALE / INV-000123). `reversesJournalEntryId` is set on the
 * automatically-generated reversal entry of a voided source row.
 */
@Entity('journal_entries')
@Index(['entryDate'])
@Index(['sourceModule', 'sourceRef'])
@Index(['reversesJournalEntryId'])
export class JournalEntry extends BaseEntity {
  @Column({ name: 'entry_number', unique: true })
  entryNumber: string;

  @Column({ name: 'entry_date', type: Date })
  entryDate: Date;

  @Column({ type: 'varchar', name: 'source_module' })
  sourceModule: JournalSourceModule;

  @Column({ name: 'source_ref', nullable: true })
  sourceRef?: string;

  @Column({ name: 'description', nullable: true })
  description?: string;

  @Column({ name: 'reverses_journal_entry_id', nullable: true })
  reversesJournalEntryId?: string;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'reverses_journal_entry_id' })
  reverses?: JournalEntry;

  @OneToMany(() => JournalLine, (l) => l.entry, { cascade: ['insert'] })
  lines: JournalLine[];
}
