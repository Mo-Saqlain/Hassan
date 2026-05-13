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

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
