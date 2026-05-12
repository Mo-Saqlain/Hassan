import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Store } from '../../stores/entities/store.entity';
import { StockTransferItem } from './stock-transfer-item.entity';

@Entity('stock_transfers')
@Index(['transferNo'], { unique: true })
@Index(['transferDate'])
export class StockTransfer extends BaseEntity {
  @Column({ name: 'transfer_no' })
  transferNo: string;

  @Column({ name: 'from_store_id' })
  fromStoreId: string;

  @ManyToOne(() => Store, { eager: true })
  @JoinColumn({ name: 'from_store_id' })
  fromStore: Store;

  @Column({ name: 'to_store_id' })
  toStoreId: string;

  @ManyToOne(() => Store, { eager: true })
  @JoinColumn({ name: 'to_store_id' })
  toStore: Store;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate: string;

  @Column({ nullable: true })
  notes?: string;

  @OneToMany(() => StockTransferItem, (line) => line.transfer, {
    cascade: true,
    eager: true,
  })
  lines: StockTransferItem[];
}
