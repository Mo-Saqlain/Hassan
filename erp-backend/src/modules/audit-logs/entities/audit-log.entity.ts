import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * One row per user-facing entity mutation. Captured by a TypeORM
 * EntitySubscriber so all writes are recorded — whether they originate
 * from an HTTP request, a cron tick (salary accrual, scheduled backup,
 * sync worker), or an internal service call.
 *
 * `entityType` is the entity's class name (e.g. "Customer", "Sale").
 * `summary` is a short, human-readable description so the user can scan
 * the log without expanding individual rows. `changes` holds a small
 * JSON snapshot of the affected fields (the after-state for create,
 * before+after diff for update, null for delete).
 */
@Entity('audit_logs')
@Index(['entityType'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'entity_type' })
  entityType: string;

  @Column({ name: 'entity_id', nullable: true })
  entityId?: string;

  @Column({ type: 'varchar' })
  action: AuditAction;

  @Column({ type: 'text' })
  summary: string;

  /** Stored as JSON text for SQLite compatibility. */
  @Column({ type: 'text', nullable: true })
  changes?: string;

  /** Best-effort: 'http' | 'cron' | 'service' | unknown. */
  @Column({ default: 'unknown' })
  source: string;
}
