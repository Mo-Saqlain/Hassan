import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Brand } from '../../brands/entities/brand.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('items')
@Index(['brandId'])
@Index(['name'])
@Index(['modelNo'])
@Index(['isActive'])
export class Item extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  sku: string;

  @Column({ unique: true, nullable: true })
  barcode?: string;

  @Column({ name: 'model_no', nullable: true })
  modelNo?: string;

  @Column({ name: 'brand_id', nullable: true })
  brandId?: string;

  @ManyToOne(() => Brand, { nullable: true, eager: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand;

  @ManyToMany(() => Category, { eager: true, cascade: false })
  @JoinTable({
    name: 'item_categories',
    joinColumn: { name: 'item_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories: Category[];

  @Column('decimal', { precision: 14, scale: 2, name: 'purchase_price', default: 0 })
  purchasePrice: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'sale_price', default: 0 })
  salePrice: number;

  @Column({ default: 'pcs' })
  unit: string;

  @Column({ type: 'integer', name: 'min_stock_level', default: 0 })
  minStockLevel: number;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
