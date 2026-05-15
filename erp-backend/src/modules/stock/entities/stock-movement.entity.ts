import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { Store } from '../../stores/entities/store.entity';

export type StockMovementType = 'IN' | 'OUT';
export type StockReferenceType =
  | 'PURCHASE'
  | 'SALE'
  | 'PURCHASE_RETURN'
  | 'SALE_RETURN'
  | 'ADJUSTMENT'
  // Inverse-direction movements booked when a sale/purchase is voided via
  // `POST /{sales,purchases}/:id/reverse`. Tagged distinctly so the stock
  // ledger can show "Sale reversal — INV-000123" rather than a bare
  // SALE/PURCHASE that doesn't match any sale/purchase row.
  | 'SALE_REVERSAL'
  | 'PURCHASE_REVERSAL';

@Entity('stock_movements')
@Index(['itemId'])
@Index(['storeId'])
@Index(['itemId', 'storeId'])
@Index(['referenceType', 'referenceId'])
@Index(['createdAt'])
export class StockMovement extends BaseEntity {
  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'store_id', nullable: true })
  storeId?: string;

  @ManyToOne(() => Store, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({ type: 'varchar' })
  type: StockMovementType;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'reference_type', type: 'varchar' })
  referenceType: StockReferenceType;

  @Column({ name: 'reference_id' })
  referenceId: string;

  @Column({ nullable: true })
  note?: string;
}
