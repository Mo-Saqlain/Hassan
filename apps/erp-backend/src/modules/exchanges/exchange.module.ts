import { Module } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { ExchangeController } from './exchange.controller';
import { ReturnsModule } from '../returns/returns.module';
import { SalesModule } from '../sales/sales.module';

/**
 * Composes the give-back (ReturnsService) and the new sale (SalesService) into
 * one atomic exchange. ItemSerialsService / AccountsService / SequenceService
 * are @Global, so they need no explicit import here.
 */
@Module({
  imports: [ReturnsModule, SalesModule],
  controllers: [ExchangeController],
  providers: [ExchangeService],
  exports: [ExchangeService],
})
export class ExchangeModule {}
