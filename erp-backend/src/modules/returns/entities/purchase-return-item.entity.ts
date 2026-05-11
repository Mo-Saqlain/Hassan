import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { PurchaseReturn } from './purchase-return.entity';

@Entity('purchase_return_items')
export class PurchaseReturnItem extends BaseEntity {
  @Column({ name: 'purchase_return_id' })
  purchaseReturnId: string;

  @ManyToOne(() => PurchaseReturn, (pr) => pr.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_return_id' })
  purchaseReturn: PurchaseReturn;

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
