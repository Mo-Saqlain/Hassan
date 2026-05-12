import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { IncentiveTarget } from './incentive-target.entity';

/**
 * Recorded incentive payout — booked when the target was achieved and the
 * supplier has confirmed / paid out the incentive. Reports add the sum of
 * awards in a period to gross profit to produce "Adjusted Net Profit".
 */
@Entity('incentive_awards')
export class IncentiveAward extends BaseEntity {
  @Column({ name: 'target_id', nullable: true })
  targetId?: string;

  @ManyToOne(() => IncentiveTarget, { nullable: true, eager: true })
  @JoinColumn({ name: 'target_id' })
  target?: IncentiveTarget;

  /** Free-form label when the award doesn't tie back to a stored target. */
  @Column()
  label: string;

  @Column({ name: 'awarded_on', type: 'date' })
  awardedOn: string;

  @Column('decimal', { precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'period_start', type: 'date', nullable: true })
  periodStart?: string;

  @Column({ name: 'period_end', type: 'date', nullable: true })
  periodEnd?: string;

  @Column({ nullable: true })
  notes?: string;
}
