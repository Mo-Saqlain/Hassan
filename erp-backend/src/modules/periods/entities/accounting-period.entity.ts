import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'HARD_CLOSED';

/**
 * A date-range slice the books are closed in. Postings to a HARD_CLOSED
 * period are rejected; SOFT_CLOSED periods accept posts but should surface a
 * warning in the UI. A date with no covering period is treated as OPEN
 * (the user hasn't started closing books yet).
 *
 * Convention: periods don't overlap. The service enforces this on create.
 */
@Entity('accounting_periods')
@Index(['startDate'])
@Index(['endDate'])
@Index(['status'])
export class AccountingPeriod extends BaseEntity {
  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'start_date', type: Date })
  startDate: Date;

  @Column({ name: 'end_date', type: Date })
  endDate: Date;

  @Column({ type: 'varchar', default: 'OPEN' })
  status: PeriodStatus;

  @Column({ name: 'closed_at', type: Date, nullable: true })
  closedAt?: Date;

  @Column({ name: 'closed_by', nullable: true })
  closedBy?: string;

  @Column({ name: 'close_reason', nullable: true })
  closeReason?: string;
}
