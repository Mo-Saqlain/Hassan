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
}
