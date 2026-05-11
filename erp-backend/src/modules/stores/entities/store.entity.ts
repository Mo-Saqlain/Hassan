import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('stores')
export class Store extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
