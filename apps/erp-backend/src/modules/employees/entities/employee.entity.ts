import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('employees')
export class Employee extends BaseEntity {
  @Column({ unique: true, nullable: true })
  code?: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  role?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  /**
   * Monthly base salary. The salary is OUT of the shop's account and INTO
   * the employee's ledger as a credit — see `employee_transactions`.
   */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    default: 0,
    name: 'monthly_salary',
  })
  monthlySalary: number;

  /** Optional opening balance — non-zero if the employee already owed (or was owed) money. */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    default: 0,
    name: 'opening_balance',
  })
  openingBalance: number;

  @Column({ name: 'joined_at', type: 'date', nullable: true })
  joinedAt?: string;

  /**
   * Day of month (1–31) on which the monthly salary is automatically
   * accrued to the employee's ledger. NULL disables auto-accrual.
   * Months without that day (e.g. day=31 in February) accrue on the
   * last day of the month.
   */
  @Column({ name: 'salary_day', type: 'int', nullable: true })
  salaryDay?: number;

  /**
   * If TRUE, the auto-accrual fires for the month the employee joined
   * even if the salary day has already passed. If FALSE, the first
   * accrual waits until the following calendar month.
   */
  @Column({ name: 'first_salary_in_advance', default: false })
  firstSalaryInAdvance: boolean;

  @Column({ nullable: true })
  notes?: string;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
