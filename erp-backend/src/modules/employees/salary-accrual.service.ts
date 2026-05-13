import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { EmployeeTransaction } from '../employee-transactions/entities/employee-transaction.entity';
import { EmployeeTransactionsService } from '../employee-transactions/employee-transactions.service';

/**
 * Posts the monthly SALARY_ACCRUED row to each active employee's ledger on
 * their configured `salaryDay`. The accrual is idempotent — running the
 * scheduler twice on the same day, or backfilling after a day off, only
 * ever creates one row per (employee, calendar month).
 *
 * Rules:
 *  - Skip employees without a salaryDay, monthlySalary, or that are inactive.
 *  - On months that don't have the configured day (e.g. day=31 in February),
 *    accrue on the last day of the month so nothing is silently lost.
 *  - For the calendar month the employee joined in, the accrual only fires
 *    when `firstSalaryInAdvance` is TRUE — otherwise the first accrual
 *    waits for the following month.
 *  - We hourly-tick (not daily) so changing salaryDay or activating an
 *    employee mid-day still picks up correctly without a restart.
 */
@Injectable()
export class SalaryAccrualService {
  private readonly logger = new Logger(SalaryAccrualService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(EmployeeTransaction)
    private readonly txns: Repository<EmployeeTransaction>,
    private readonly employeeTxnService: EmployeeTransactionsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourlyTick(): Promise<void> {
    try {
      const created = await this.accrueDueNow();
      if (created.length > 0) {
        this.logger.log(
          `Accrued monthly salary for ${created.length} employee(s): ${created
            .map((c) => c.employeeName)
            .join(', ')}`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Salary accrual failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Post accrual rows for every employee whose salary day has arrived in
   * the current calendar month and who hasn't already been accrued this
   * month. Safe to call manually — duplicates are prevented per month.
   *
   * When `employeeId` is supplied, only that employee is considered
   * (used by the "accrue now" admin endpoint).
   */
  async accrueDueNow(employeeId?: string): Promise<
    Array<{ employeeId: string; employeeName: string; voucherNo: string }>
  > {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const ym = today.toISOString().slice(0, 7); // 'YYYY-MM'
    const monthStart = `${ym}-01`;
    const monthEnd = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    )
      .toISOString()
      .slice(0, 10);
    const lastDayOfMonth = Number(monthEnd.slice(-2));

    const where: any = { isActive: true };
    if (employeeId) where.id = employeeId;
    const candidates = await this.employees.find({ where });

    const created: Array<{ employeeId: string; employeeName: string; voucherNo: string }> = [];

    for (const emp of candidates) {
      const salaryDay = emp.salaryDay;
      const salary = Number(emp.monthlySalary ?? 0);
      if (!salaryDay || salary <= 0) continue;

      // Months without the configured day (e.g. day=31 in Feb) collapse
      // to the last day of the month.
      const dueOnDay = Math.min(salaryDay, lastDayOfMonth);
      if (dayOfMonth < dueOnDay) continue;

      if (emp.joinedAt) {
        const joinedYm = emp.joinedAt.slice(0, 7);
        if (joinedYm === ym && !emp.firstSalaryInAdvance) continue;
        if (joinedYm > ym) continue;
      }

      const already = await this.txns.findOne({
        where: {
          employeeId: emp.id,
          type: 'SALARY_ACCRUED',
          transactionDate: Between(monthStart, monthEnd),
        },
      });
      if (already) continue;

      const row = await this.employeeTxnService.create({
        employeeId: emp.id,
        type: 'SALARY_ACCRUED',
        amount: salary,
        transactionDate: `${ym}-${String(dueOnDay).padStart(2, '0')}`,
        description: `Monthly salary for ${ym}`,
      });
      created.push({
        employeeId: emp.id,
        employeeName: emp.name,
        voucherNo: row.voucherNo,
      });
    }

    return created;
  }
}
