import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('customers')
export class Customer extends BaseEntity {
  @Column({ unique: true, nullable: true })
  code?: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  address?: string;

  @Column('decimal', { precision: 14, scale: 2, default: 0, name: 'opening_balance' })
  openingBalance: number;

  /**
   * Maximum unpaid balance the shop will extend to this customer. POS blocks
   * a CREDIT or partial-pay sale that would push outstanding above this
   * ceiling. 0 means "no credit allowed"; a future SUPERUSER-reauth override
   * mechanism can temporarily bypass the check.
   */
  @Column('decimal', { precision: 14, scale: 2, default: 0, name: 'credit_limit' })
  creditLimit: number;

  /** Master switch — when false, all CREDIT / partial-pay sales are blocked. */
  @Column({ default: false, name: 'credit_enabled' })
  creditEnabled: boolean;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
