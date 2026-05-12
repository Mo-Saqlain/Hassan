import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Employee } from '../../employees/entities/employee.entity';

/** Which slice of sales the rule applies to. */
export type IncentiveBasis = 'ALL_SALES' | 'CATEGORY' | 'ITEM' | 'BRAND';

/**
 * Rule for crediting an employee a percentage of qualifying sales. Multiple
 * rules can apply to the same sale — each gets its own line item in the
 * computed ledger and they sum independently.
 *
 * Examples:
 *   - "Asad gets 1% of all sales" → basis=ALL_SALES, percentage=1
 *   - "Kashif gets 2% of every Refrigerators sale" → basis=CATEGORY,
 *      referenceId=<category-uuid>, percentage=2
 *   - "Imran gets Rs 50 (computed as a % of unit price) per DAWLANCE LVS-15"
 *      → basis=ITEM, referenceId=<item-uuid>, percentage=...
 */
@Entity('employee_incentive_rules')
@Index(['employeeId'])
@Index(['basis'])
export class EmployeeIncentiveRule extends BaseEntity {
  @Column({ name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => Employee, { eager: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ type: 'varchar' })
  basis: IncentiveBasis;

  /** Category / Item / Brand id when basis ≠ ALL_SALES; null otherwise. */
  @Column({ name: 'reference_id', nullable: true })
  referenceId?: string;

  @Column('decimal', { precision: 6, scale: 3 })
  percentage: number;

  @Column({ name: 'starts_on', type: 'date', nullable: true })
  startsOn?: string;

  @Column({ name: 'ends_on', type: 'date', nullable: true })
  endsOn?: string;

  @Column({ nullable: true })
  notes?: string;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
