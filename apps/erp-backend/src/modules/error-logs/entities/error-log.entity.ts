import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ErrorLevel = 'ERROR' | 'WARN';

/**
 * One row per uncaught exception or HTTP error response. Written by the
 * global Nest exception filter; the service is also exposed so cron jobs
 * and other internal callers can log error events directly when wrapping
 * their own try/catch.
 */
@Entity('error_logs')
@Index(['createdAt'])
@Index(['statusCode'])
export class ErrorLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'varchar', default: 'ERROR' })
  level: ErrorLevel;

  /** Where in the app it came from (e.g. 'http', 'cron:salary-accrual'). */
  @Column({ default: 'unknown' })
  source: string;

  @Column({ nullable: true })
  method?: string;

  @Column({ type: 'text', nullable: true })
  path?: string;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode?: number;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  stack?: string;

  /** Optional JSON snippet (request body, params, etc.) for context. */
  @Column({ type: 'text', nullable: true })
  context?: string;
}
