import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('categories')
@Index(['parentId'])
export class Category extends BaseEntity {
  @Column()
  name: string;

  /**
   * Short uppercase code (up to 8 chars) used as the category segment of
   * auto-generated local serials: `LOCAL-<code>-<year>-<seq>`. Optional —
   * only required for categories whose items use the local-serial flow.
   * Examples: "COOLER", "STAND", "REMOTE", "FAN", "CABLE". Uniqueness is
   * enforced in CategoriesService.create/update at the application layer
   * because a DB-level unique would need a partial index (allow many NULLs)
   * whose syntax differs between SQLite and Postgres.
   */
  @Column({ length: 8, nullable: true })
  code?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'parent_id', nullable: true })
  parentId?: string | null;

  @ManyToOne(() => Category, (c) => c.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent?: Category | null;

  @OneToMany(() => Category, (c) => c.parent)
  children: Category[];

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
