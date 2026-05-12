import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { PurchaseOrder } from './purchase-order.entity';

@Entity('purchase_order_items')
export class PurchaseOrderItem extends BaseEntity {
  @Column({ name: 'purchase_order_id' })
  purchaseOrderId: string;

  @ManyToOne(() => PurchaseOrder, (po) => po.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'integer' })
  quantity: number;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'expected_unit_cost',
  })
  expectedUnitCost: number;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'line_total',
  })
  lineTotal: number;
}
