import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { Store } from '../../stores/entities/store.entity';
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

  /**
   * Optional per-line store. When a purchase is split across stores,
   * each line records which store the goods physically went to.
   * Falls back to the Purchase header's storeId when not set.
   */
  @Column({ name: 'store_id', nullable: true })
  storeId?: string;

  @ManyToOne(() => Store, { nullable: true, eager: true })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({ type: 'integer' })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'unit_price' })
  unitPrice: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'line_total' })
  lineTotal: number;
}
