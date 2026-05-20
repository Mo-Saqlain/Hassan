import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Store } from '../../stores/entities/store.entity';

export type ItemSerialStatus =
  | 'IN_STOCK'
  | 'SOLD'
  | 'RETURNED'
  | 'DAMAGED'
  | 'WRITE_OFF';

/**
 * One row per physical appliance the shop has ever handled. Created either:
 *   - at purchase time (operator pastes a textarea of newline-separated
 *     serials into a tracksSerials line), OR
 *   - at sale time (POS auto-creates the row when the salesman types a
 *     serial that isn't yet in stock — handy for the case where the
 *     purchase form skipped them).
 *
 * Serial uniqueness is global (across all items), not per-item — matches
 * how manufacturers actually number their units.
 */
@Entity('item_serials')
@Index(['serial'], { unique: true })
@Index(['itemId', 'status'])
@Index(['status'])
@Index(['saleInvoiceNo'])
@Index(['soldToCustomerId'])
@Index(['warrantyEndAt'])
export class ItemSerial extends BaseEntity {
  @Column()
  serial: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'varchar', default: 'IN_STOCK' })
  status: ItemSerialStatus;

  /** Soft link back to the purchase voucher (no FK — purchase can be reversed). */
  @Column({ name: 'purchase_bill_no', nullable: true })
  purchaseBillNo?: string;

  @Column({ name: 'purchased_at', type: Date, nullable: true })
  purchasedAt?: Date;

  @Column('decimal', {
    precision: 14,
    scale: 2,
    name: 'purchase_price',
    nullable: true,
  })
  purchasePrice?: number;

  @Column({ name: 'current_store_id', nullable: true })
  currentStoreId?: string;

  @ManyToOne(() => Store, { nullable: true })
  @JoinColumn({ name: 'current_store_id' })
  currentStore?: Store;

  /** Sold-side metadata. Populated when status flips to SOLD. */
  @Column({ name: 'sale_invoice_no', nullable: true })
  saleInvoiceNo?: string;

  @Column({ name: 'sold_at', type: Date, nullable: true })
  soldAt?: Date;

  @Column({ name: 'sold_to_customer_id', nullable: true })
  soldToCustomerId?: string;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'sold_to_customer_id' })
  soldToCustomer?: Customer;

  /** Warranty start = soldAt by convention. Stored explicitly so an extended-
   *  warranty override at the POS can shift it later without touching soldAt. */
  @Column({ name: 'warranty_start_at', type: Date, nullable: true })
  warrantyStartAt?: Date;

  @Column({ type: 'integer', name: 'warranty_days', nullable: true })
  warrantyDays?: number;

  /** Warranty flavour at time of sale. Frozen on the serial row so a later
   *  edit to Item.warrantyType doesn't retroactively reshape what was
   *  promised to the customer who already walked out with the unit. */
  @Column({ name: 'warranty_type', nullable: true })
  warrantyType?: string;

  /** Pre-computed expiry. Set at sale time from warrantyStartAt +
   *  warrantyDays. Stored (not computed on read) so the warranty-lookup
   *  endpoint is a single indexed query, and so reports can group by
   *  "expires this month" without re-deriving per row. */
  @Column({ name: 'warranty_end_at', type: Date, nullable: true })
  warrantyEndAt?: Date;

  @Column({ nullable: true })
  notes?: string;
}
