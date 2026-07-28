import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type CashSessionStatus = 'OPEN' | 'CLOSED';

/**
 * One session per shop-day. Opening a session is a manual reconciliation
 * step: cashier counts physical cash, compares to expected (= prior day
 * closing), and any shortfall can be covered by a fund transfer recorded
 * separately. Closing snapshots the end-of-day count.
 */
@Entity('cash_register_sessions')
@Index(['sessionDate'], { unique: true })
export class CashRegisterSession extends BaseEntity {
  @Column({ name: 'session_date', type: 'date' })
  sessionDate: string;

  @Column({ type: 'varchar', default: 'OPEN' })
  status: CashSessionStatus;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'expected_opening',
    default: 0,
  })
  expectedOpening: number;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'actual_opening',
    default: 0,
  })
  actualOpening: number;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'opening_difference',
    default: 0,
  })
  openingDifference: number;

  /**
   * What the system expected in the till at the moment the cashier closed —
   * a SNAPSHOT, not the authority. Expected cash is a function of the day's
   * till movements, and correcting a voucher from that day legitimately changes
   * it, so reads go through `CashRegisterService.withLiveVariance`, which
   * re-derives the figure and surfaces this stored one as
   * `expectedClosingAtClose` (plus `varianceStale` when the two disagree).
   * Kept because "what the cashier reconciled against" is evidence.
   */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'expected_closing',
    nullable: true,
  })
  expectedClosing?: number;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'actual_closing',
    nullable: true,
  })
  actualClosing?: number;

  /**
   * Denomination breakdown captured at close time. Map of note value → count.
   * Persisted as JSON so reconciliation reports can show "two 5000s short"
   * rather than just a numeric variance. The close modal auto-sums to
   * `actualClosing` so the cashier never types the total directly.
   */
  @Column({
    type: 'simple-json',
    name: 'closing_denominations',
    nullable: true,
  })
  closingDenominations?: Record<string, number>;

  /** Variance as computed at close time. Snapshot — see `expectedClosing`. */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'closing_difference',
    nullable: true,
  })
  closingDifference?: number;

  /** FundTransfer.id if the cashier covered a shortfall during opening. */
  @Column({ name: 'opening_transfer_id', nullable: true })
  openingTransferId?: string;

  @Column({ name: 'opened_at', type: Date, nullable: true })
  openedAt?: Date;

  @Column({ name: 'closed_at', type: Date, nullable: true })
  closedAt?: Date;

  @Column({ nullable: true })
  notes?: string;
}
