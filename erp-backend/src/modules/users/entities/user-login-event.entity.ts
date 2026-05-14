import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One row per successful login. Surfaced to the superuser in the
 * "Recent logins" tab so they can see who is using the system; rows
 * are flagged seen once the superuser opens that tab.
 */
@Entity('user_login_events')
@Index(['createdAt'])
export class UserLoginEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  username: string;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: 'seen_by_admin', default: false })
  seenByAdmin: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
