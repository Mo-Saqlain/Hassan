import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Account } from '../../accounts/entities/account.entity';

/**
 * Semantics from the EMPLOYEE LEDGER's point of view:
 *
 * - `SALARY_ACCRUED`   — monthly salary obligation booked on the employee's
 *                        configured salary day → DEBIT (we now owe them this
 *                        month's salary). Auto-posted by the scheduler.
 * - `SALARY`           — shop pays salary → credit (OUT of shop, settles employee debt)
 * - `ADVANCE`          — shop advances money → credit (OUT of shop, employee now owes back)
 * - `REIMBURSEMENT`    — shop reimburses an expense the employee paid out-of-pocket
 *                        → credit (OUT of shop, settles what we owed the employee)
 * - `EXPENSE`          — employee spent shop money on a shop-related expense
 *                        → credit (treated like reimbursement)
 * - `INCENTIVE_PAYOUT` — shop pays out earned incentives → credit (OUT of shop)
 * - `ADJUSTMENT`       — manual debit/credit correction
 *
 * The ledger view debits incentives EARNED (computed from rules+sales) +
 * SALARY_ACCRUED rows, and credits all payouts above to give a running
 * balance — positive means we owe the employee, negative means they owe us.
 */
export type EmployeeTransactionType =
  | 'SALARY_ACCRUED'
  | 'SALARY'
  | 'ADVANCE'
  | 'REIMBURSEMENT'
  | 'EXPENSE'
  | 'INCENTIVE_PAYOUT'
  | 'ADJUSTMENT';

@Entity('employee_transactions')
@Index(['employeeId'])
@Index(['voucherNo'], { unique: true })
@Index(['employeeId', 'transactionDate'])
@Index(['employeeId', 'type'])
@Index(['transactionDate'])
export class EmployeeTransaction extends BaseEntity {
  @Column({ name: 'voucher_no' })
  voucherNo: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => Employee, { eager: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ type: 'varchar' })
  type: EmployeeTransactionType;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  @Column('decimal', { precision: 14, scale: 2 })
  amount: number;

  /**
   * Cash/Bank/Wallet account the money flowed through. Null for ADJUSTMENT
   * or EXPENSE (when the employee paid out of pocket).
   */
  @Column({ name: 'account_id', nullable: true })
  accountId?: string;

  @ManyToOne(() => Account, { nullable: true, eager: true })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  notes?: string;
}
