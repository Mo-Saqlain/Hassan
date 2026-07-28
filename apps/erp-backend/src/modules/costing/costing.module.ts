import { Global, Module } from '@nestjs/common';
import { RecostService } from './recost.service';
import { CostingController } from './costing.controller';

/**
 * `@Global` for the same reason SequenceModule / JournalModule are: the services
 * that mutate cost-affecting documents (purchases, sales, returns) all need to
 * recost afterwards, and importing this module into each of them — while it
 * depends on their entities — would be a cycle. It depends only on entity
 * classes, never on those modules' services, so nothing circles back.
 */
@Global()
@Module({
  controllers: [CostingController],
  providers: [RecostService],
  exports: [RecostService],
})
export class CostingModule {}
