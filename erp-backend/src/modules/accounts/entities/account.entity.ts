import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type AccountType = 'CASH' | 'BANK' | 'WALLET' | 'CAPITAL' | 'CREDIT';

@Entity('accounts')
export class Account extends BaseEntity {
  @Column({ unique: true, nullable: true })
  code?: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: 'CASH' })
  type: AccountType;

  @Column({ name: 'account_number', nullable: true })
  accountNumber?: string;

  @Column({ nullable: true })
  bank?: string;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    default: 0,
    name: 'opening_balance',
  })
  openingBalance: number;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
