import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('employees')
export class Employee extends BaseEntity {
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

  @Column({ nullable: true })
  notes?: string;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
