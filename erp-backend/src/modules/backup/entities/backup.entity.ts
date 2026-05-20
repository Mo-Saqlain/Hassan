import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type BackupTrigger = 'AUTO' | 'MANUAL';

/**
 * Metadata for each backup file written to disk. The actual JSON snapshot
 * lives at `filePath` so this row stays tiny and queryable.
 */
@Entity('backups')
@Index(['createdAt'])
export class Backup extends BaseEntity {
  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'file_path' })
  filePath: string;

  @Column({ type: 'integer', name: 'size_bytes', default: 0 })
  sizeBytes: number;

  @Column({ type: 'varchar', default: 'JSON' })
  format: 'JSON';

  @Column({ type: 'varchar', default: 'AUTO' })
  trigger: BackupTrigger;

  @Column({ nullable: true })
  notes?: string;

  /**
   * SHA-256 of the file's bytes at snapshot time. The restore flow verifies
   * the file on disk hasn't been edited or corrupted before replaying it,
   * and the Backup history page surfaces a green / red dot per row so the
   * operator can spot a stale file at a glance. Null on rows written
   * before this column existed.
   */
  @Column({ nullable: true })
  sha256?: string;

  /** Last time we verified the file's hash on disk against this row. */
  @Column({ name: 'verified_at', type: Date, nullable: true })
  verifiedAt?: Date;
}
