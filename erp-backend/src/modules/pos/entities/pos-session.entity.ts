import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';

export type PosSessionStatus = 'ACTIVE' | 'CLOSED';

@Entity('pos_sessions')
@Index(['status'])
@Index(['userId'])
@Index(['storeId'])
@Index(['startedAt'])
export class PosSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'store_id', nullable: true })
  storeId?: string;

  @ManyToOne(() => Store, { nullable: true, eager: true })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: PosSessionStatus;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    default: 0,
    name: 'opening_float',
  })
  openingFloat: number;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    default: 0,
    name: 'closing_amount',
  })
  closingAmount: number;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    default: 0,
    name: 'sales_total',
  })
  salesTotal: number;

  @Column({ type: 'integer', default: 0, name: 'sales_count' })
  salesCount: number;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column({ nullable: true, name: 'ended_at' })
  endedAt?: Date;
}
