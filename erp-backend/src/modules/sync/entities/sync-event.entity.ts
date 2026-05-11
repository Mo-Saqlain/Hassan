import { Column, Entity, Index, PrimaryColumn, CreateDateColumn } from 'typeorm';

export type SyncEventStatus = 'PROCESSED' | 'FAILED' | 'DUPLICATE';

@Entity('sync_events')
@Index(['type'])
export class SyncEvent {
  // Client-supplied UUID — also serves as idempotency key.
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'text' })
  payload: string;

  @Column({ type: 'varchar' })
  status: SyncEventStatus;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'result_id', nullable: true })
  resultId?: string;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;
}
