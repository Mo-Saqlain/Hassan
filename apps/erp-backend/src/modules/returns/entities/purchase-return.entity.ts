import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { Store } from '../../stores/entities/store.entity';
import { Purchase } from '../../purchases/entities/purchase.entity';
import { PurchaseReturnItem } from './purchase-return-item.entity';

@Entity('purchase_returns')
@Index(['returnNo'], { unique: true })
@Index(['supplierId'])
@Index(['purchaseId'])
@Index(['createdAt'])
export class PurchaseReturn extends BaseEntity {
  @Column({ name: 'return_no' })
  returnNo: string;

  @Column({ name: 'purchase_id', nullable: true })
  purchaseId?: string;

  @ManyToOne(() => Purchase, { nullable: true, eager: true })
  @JoinColumn({ name: 'purchase_id' })
  purchase?: Purchase;

  @Column({ name: 'supplier_id', nullable: true })
  supplierId?: string;

  @ManyToOne(() => Supplier, { nullable: true, eager: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: Supplier;

  @Column({ name: 'store_id', nullable: true })
  storeId?: string;

  @ManyToOne(() => Store, { nullable: true, eager: true })
  @JoinColumn({ name: 'store_id' })
  store?: Store;

  @Column('decimal', { precision: 14, scale: 2, name: 'total_amount', default: 0 })
  totalAmount: number;

  /**
   * Whether real goods physically leave our warehouse, or this is a pure
   * financial supplier credit with no stock movement.
   *   • STOCK (default)   → goods go back to the supplier (stock OUT +
   *                         costedQty drop) — the normal purchase return.
   *   • WARRANTY_CREDIT   → a manufacturer credited our account for a unit that
   *                         never re-entered our stock (it went customer →
   *                         company). NO stock OUT, NO costedQty change — only
   *                         the supplier ledger is credited by `totalAmount`
   *                         (the figure the company put on our ledger).
   */
  @Column({ name: 'disposition', default: 'STOCK' })
  disposition: 'STOCK' | 'WARRANTY_CREDIT';

  @Column({ nullable: true })
  reason?: string;

  @OneToMany(() => PurchaseReturnItem, (line) => line.purchaseReturn, {
    cascade: true,
    eager: true,
  })
  lines: PurchaseReturnItem[];
}
