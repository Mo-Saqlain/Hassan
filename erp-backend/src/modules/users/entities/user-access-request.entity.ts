import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * A would-be user submits one of these from the public sign-up screen.
 * Stays PENDING until a superuser approves (assigning a username +
 * password) or rejects it. No row is ever auto-promoted to a real user.
 */
@Entity('user_access_requests')
export class UserAccessRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requested_username' })
  requestedUsername: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: AccessRequestStatus;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @Column({ name: 'reviewer_id', nullable: true })
  reviewerId?: string;

  @Column({ name: 'created_user_id', nullable: true })
  createdUserId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
