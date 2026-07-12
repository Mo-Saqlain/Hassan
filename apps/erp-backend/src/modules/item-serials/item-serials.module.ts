import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemSerial } from './entities/item-serial.entity';
import { Item } from '../items/entities/item.entity';
import { Category } from '../categories/entities/category.entity';
import { Sequence } from '../sequences/entities/sequence.entity';
import { ItemSerialsService } from './item-serials.service';
import { ItemSerialsController } from './item-serials.controller';

/**
 * Global because Sales, Purchases, and Returns all consume the service to
 * mark units sold / returned / re-stocked. Marking @Global keeps callers
 * from each importing the module (the same pattern AccountsModule uses).
 * Item + Category + Sequence are registered here so the local-serial mint
 * flow can resolve the item's category code and increment the per-(code,
 * year) counter inside its own transaction.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ItemSerial, Item, Category, Sequence])],
  providers: [ItemSerialsService],
  controllers: [ItemSerialsController],
  exports: [ItemSerialsService],
})
export class ItemSerialsModule {}
