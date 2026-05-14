import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { Brand } from '../../brands/entities/brand.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

export type IncentiveBasis = 'ITEM' | 'BRAND';

/**
 * A sales target a supplier or brand sets that earns an incentive when met.
 * The shop sometimes sells a unit at a loss because clearing the target
 * unlocks an incentive that exceeds the per-unit loss — so true profit
 * must include the incentive bucket alongside gross margin.
 */
@Entity('incentive_targets')
@Index(['basis'])
@Index(['itemId'])
@Index(['brandId'])
@Index(['supplierId'])
@Index(['isActive'])
@Index(['periodStart', 'periodEnd'])
export class IncentiveTarget extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'varchar' })
  basis: IncentiveBasis;

  @Column({ name: 'item_id', nullable: true })
  itemId?: string;

  @ManyToOne(() => Item, { nullable: true, eager: true })
  @JoinColumn({ name: 'item_id' })
  item?: Item;

  @Column({ name: 'brand_id', nullable: true })
  brandId?: string;

  @ManyToOne(() => Brand, { nullable: true, eager: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand;

  @Column({ name: 'supplier_id', nullable: true })
  supplierId?: string;

  @ManyToOne(() => Supplier, { nullable: true, eager: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: Supplier;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ type: 'integer', name: 'target_quantity' })
  targetQuantity: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'incentive_amount' })
  incentiveAmount: number;

  @Column({ nullable: true })
  notes?: string;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
