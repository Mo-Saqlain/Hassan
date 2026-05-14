import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'SUPERUSER' | 'USER';

/**
 * Authenticated user of the ERP. Only a SUPERUSER may create more users
 * and access the System → Audit / Errors tabs. Regular USERs can still
 * take backups and use the rest of the app.
 *
 * Passwords are stored as `scrypt:saltHex:hashHex` — never as plaintext.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', default: 'USER' })
  role: UserRole;

  @Column({ name: 'full_name', nullable: true })
  fullName?: string;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  /**
   * Opaque session token; rotates on every login and on password change.
   * NULL means the user has no active session (logged out / forced out).
   */
  @Column({ name: 'session_token', nullable: true, unique: true })
  sessionToken?: string;

  @Column({ name: 'session_expires_at', type: 'timestamp', nullable: true })
  sessionExpiresAt?: Date;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
