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

/**
 * Four warranty flavours covering Hassan Electronics' real product mix:
 *   - COMPANY        — manufacturer-backed warranty. Expiry shown on receipt.
 *   - SHOP           — shop-issued warranty (e.g. our own 30-day cover on
 *                      gray-market goods). Expiry shown on receipt.
 *   - CHECKING_ONLY  — no warranty, but the unit was bench-tested before
 *                      handover. Receipt prints "No warranty. Item checked
 *                      at time of sale."
 *   - NONE           — no warranty at all. Receipt prints "No Warranty".
 *
 * The `hasWarranty` boolean is the master switch: when false, NO warranty
 * UI / print block renders and `warrantyType` is ignored.
 */
export type WarrantyType = 'COMPANY' | 'SHOP' | 'CHECKING_ONLY' | 'NONE';

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

  /**
   * Whether this item is sold as serialised units (appliances) or as a bulk
   * SKU (accessories, parts, remotes). When true, the system can capture and
   * resolve manufacturer serials per unit. Capture is governed separately by
   * `serialRequiredOnSale` so gray-market items (serials exist but aren't
   * reliable) can have `tracksSerials=true, serialRequiredOnSale=false`.
   */
  @Column({ default: true, name: 'tracks_serials' })
  tracksSerials: boolean;

  /**
   * Hard-enforces serial entry at POS checkout. When true *and* `tracksSerials`
   * is true, the POS rejects a checkout that doesn't supply one serial per
   * unit. When false, the cart still shows an optional serial input but the
   * sale can proceed without it. Default true — the strict path is what
   * appliances need.
   */
  @Column({ default: true, name: 'serial_required_on_sale' })
  serialRequiredOnSale: boolean;

  /**
   * Master switch for warranty handling. When false, no warranty UI renders
   * anywhere in the app and the receipt prints "NO WARRANTY COVERAGE / SOLD
   * AS-IS" under the line. Used for accessories the shop sells without any
   * cover (stands, cables, remotes).
   */
  @Column({ default: true, name: 'has_warranty' })
  hasWarranty: boolean;

  /**
   * Warranty flavour. Only consulted when `hasWarranty` is true. See the
   * WarrantyType jsdoc above for the four values and their receipt-print
   * behaviour.
   */
  @Column({
    type: 'varchar',
    name: 'warranty_type',
    default: 'COMPANY',
  })
  warrantyType: WarrantyType;

  /**
   * Default warranty length in **days** (not months — finer granularity for
   * shop-issued covers like "30 days bench-tested"). Copied onto every sold
   * unit at POS checkout. Null means open-ended / not applicable (use this
   * with CHECKING_ONLY or NONE warrantyType).
   */
  @Column({ type: 'integer', name: 'warranty_days', nullable: true })
  warrantyDays?: number;
}
