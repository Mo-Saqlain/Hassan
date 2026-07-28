import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { SaleReturn } from './sale-return.entity';

@Entity('sale_return_items')
@Index(['saleReturnId'])
@Index(['itemId'])
export class SaleReturnItem extends BaseEntity {
  @Column({ name: 'sale_return_id' })
  saleReturnId: string;

  @ManyToOne(() => SaleReturn, (sr) => sr.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_return_id' })
  saleReturn: SaleReturn;

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
   * Manufacturer serials of the units that came back on this line, as supplied
   * at return time. The authoritative per-unit state still lives on
   * `item_serials`; this is the record of WHICH units this document touched.
   *
   * Without it a reversal cannot walk the serial statuses back — the return row
   * would know how many units returned but not which ones. `simple-array` is
   * stored as comma-joined text, so it works on SQLite and Postgres alike.
   */
  @Column({ name: 'serials', type: 'simple-array', nullable: true })
  serials?: string[];
}
