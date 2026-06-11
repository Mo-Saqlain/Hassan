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

  /**
   * Line-level warranty snapshot — the "stamped receipt" record for items that
   * are sold by model only (no per-unit serial to hang warranty on). Frozen at
   * sale time exactly like `ItemSerial.warranty*` so editing the Item template
   * later never rewrites a past sale. For serialised lines this still mirrors
   * the per-unit cover so the by-invoice / by-customer / by-model lookups read
   * uniformly and survive a serial being detached by a return.
   *
   * Only populated for real cover (warrantyType COMPANY / SHOP). CHECKING_ONLY,
   * NONE, and hasWarranty=false lines leave these null — there is no window.
   */
  @Column({ name: 'warranty_type', nullable: true })
  warrantyType?: string;

  @Column({ type: 'integer', name: 'warranty_days', nullable: true })
  warrantyDays?: number;

  @Column({ name: 'warranty_start_at', type: Date, nullable: true })
  warrantyStartAt?: Date;

  @Column({ name: 'warranty_end_at', type: Date, nullable: true })
  warrantyEndAt?: Date;
}
