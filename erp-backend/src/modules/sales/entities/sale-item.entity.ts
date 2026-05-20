import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { Sale } from './sale.entity';

@Entity('sale_items')
@Index(['saleId'])
@Index(['itemId'])
export class SaleItem extends BaseEntity {
  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => Sale, (sale) => sale.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

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

  /**
   * Weighted-average unit cost at the moment the sale was rung up. Snapshotted
   * onto the line so historical COGS / margin reports don't shift retroactively
   * when later purchases move the running average. The journal posts COGS using
   * this value, not `item.purchasePrice` (which only reflects "latest" cost).
   */
  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'cost_at_sale_time',
    default: 0,
  })
  costAtSaleTime: number;
}
