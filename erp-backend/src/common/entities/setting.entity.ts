import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Tiny key/value store for user-tunable preferences that don't justify
 * their own entity. First user: backup.scheduledHour (0–23) for the
 * daily-backup cron.
 */
@Entity('settings')
export class Setting {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'varchar' })
  value: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
