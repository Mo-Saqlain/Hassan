import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { PosSession } from './pos-session.entity';

/**
 * Local cart line for an active POS session. These rows live only in the
 * local SQLite — they are cleared on checkout (they materialize into a Sale)
 * or on explicit clear/discard.
 */
@Entity('pos_cart_items')
@Index(['sessionId'])
export class PosCartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => PosSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: PosSession;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'integer' })
  quantity: number;

  @Column('decimal', { precision: 14, scale: 2 })
  price: number;

  @Column('decimal', { precision: 14, scale: 2 })
  total: number;

  @CreateDateColumn({ name: 'added_at' })
  addedAt: Date;
}
