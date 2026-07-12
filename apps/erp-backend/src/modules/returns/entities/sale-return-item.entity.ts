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
}
