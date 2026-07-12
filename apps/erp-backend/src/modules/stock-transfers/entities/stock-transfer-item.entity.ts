import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { StockTransfer } from './stock-transfer.entity';

@Entity('stock_transfer_items')
@Index(['stockTransferId'])
@Index(['itemId'])
export class StockTransferItem extends BaseEntity {
  @Column({ name: 'stock_transfer_id' })
  stockTransferId: string;

  @ManyToOne(() => StockTransfer, (t) => t.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stock_transfer_id' })
  transfer: StockTransfer;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'integer' })
  quantity: number;
}
