import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Item } from '../../items/entities/item.entity';
import { Store } from '../../stores/entities/store.entity';

export type DamageStatus =
  | 'DAMAGED'
  | 'IN_REPAIR'
  | 'WRITE_OFF'
  | 'REPAIRED';

/**
 * A damaged-goods record represents a quantity of an item physically removed
 * from sellable stock — broken in transit, dropped on the floor, needs
 * service. The stock-out happens at creation (the goods leave the on-hand
 * count immediately). When status flips to REPAIRED we book a reversing
 * stock-in so the items rejoin sellable inventory.
 *
 * Status workflow:
 *   DAMAGED      → out of stock; might be unrepairable
 *   IN_REPAIR    → out of stock; with a technician
 *   WRITE_OFF    → out of stock permanently (loss)
 *   REPAIRED     → back in stock; reversing IN already booked
 */
@Entity('damaged_goods')
@Index(['status'])
@Index(['voucherNo'], { unique: true })
@Index(['itemId'])
@Index(['storeId'])
@Index(['reportedOn'])
export class DamagedGood extends BaseEntity {
  @Column({ name: 'voucher_no' })
  voucherNo: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'store_id', nullable: true })
  storeId?: string;

  @ManyToOne(() => Store, { nullable: true, eager: true })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'varchar', default: 'DAMAGED' })
  status: DamageStatus;

  @Column({ name: 'reported_on', type: 'date' })
  reportedOn: string;

  @Column({ name: 'resolved_on', type: 'date', nullable: true })
  resolvedOn?: string;

  @Column({ nullable: true })
  reason?: string;

  @Column({ nullable: true })
  notes?: string;
}
