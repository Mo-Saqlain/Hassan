import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { Purchase } from './purchase.entity';

@Entity('purchase_items')
export class PurchaseItem extends BaseEntity {
  @Column({ name: 'purchase_id' })
  purchaseId: string;

  @ManyToOne(() => Purchase, (p) => p.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'integer' })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'unit_price' })
  unitPrice: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'line_total' })
  lineTotal: number;
}
