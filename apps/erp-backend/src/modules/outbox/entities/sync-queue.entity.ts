import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SyncQueueStatus = 'PENDING' | 'SYNCED' | 'FAILED';

/**
 * Local outbox: events created on this node that need to be pushed
 * to the cloud sync endpoint. The cloud receiver stores them in `sync_events`.
 */
@Entity('sync_queue')
@Index(['status'])
@Index(['status', 'createdAt'])
@Index(['type'])
export class SyncQueueEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'text' })
  payload: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: SyncQueueStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  error?: string;

  /**
   * When we last tried to push this row. Used by the poison-pill skip logic
   * — once a row is FAILED we don't retry it on every Sync click (an
   * intermittent server-side bug would never stop spamming the user with
   * banner notifications). The user has to explicitly clear / fix the row.
   */
  @Column({ name: 'last_attempt_at', type: Date, nullable: true })
  lastAttemptAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
