import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemSerial } from './entities/item-serial.entity';
import { ItemSerialsService } from './item-serials.service';
import { ItemSerialsController } from './item-serials.controller';

/**
 * Global because Sales, Purchases, and Returns all consume the service to
 * mark units sold / returned / re-stocked. Marking @Global keeps callers
 * from each importing the module (the same pattern AccountsModule uses).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ItemSerial])],
  providers: [ItemSerialsService],
  controllers: [ItemSerialsController],
  exports: [ItemSerialsService],
})
export class ItemSerialsModule {}
