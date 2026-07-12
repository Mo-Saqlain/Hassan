import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Atomic counter per voucher prefix. Replaces the old `count + 1` voucher
 * generation, which under concurrent inserts could allocate the same
 * number twice (e.g. local POS + cloud sync receiver applying a SALE_CREATED
 * event in the same millisecond).
 *
 * `nextValue` stores the value to be returned by the NEXT `.next()` call;
 * each call returns the current value and advances by 1.
 */
@Entity('sequences')
export class Sequence {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  prefix: string;

  @Column({ name: 'next_value', type: 'integer', default: 1 })
  nextValue: number;

  @UpdateDateColumn({ name: 'updated_at', type: Date })
  updatedAt: Date;
}
