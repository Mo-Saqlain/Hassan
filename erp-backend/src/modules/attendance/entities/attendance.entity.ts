import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Employee } from '../../employees/entities/employee.entity';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';

/** One row per (employee, date). The unique index enforces no duplicates. */
@Entity('attendance')
@Index(['date'])
@Unique(['employeeId', 'date'])
export class Attendance extends BaseEntity {
  @Column({ name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => Employee, { eager: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', default: 'PRESENT' })
  status: AttendanceStatus;

  @Column({ name: 'check_in', nullable: true })
  checkIn?: string;

  @Column({ name: 'check_out', nullable: true })
  checkOut?: string;

  @Column({ nullable: true })
  notes?: string;
}
