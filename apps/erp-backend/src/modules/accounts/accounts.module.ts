import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

// Global so SalesModule / PurchasesModule / PaymentsModule (and any other
// write path that posts journal entries against system accounts) can inject
// AccountsService.findSystem() without each one having to add an explicit
// import. Matches SequenceModule / JournalsModule / PeriodsModule.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService, TypeOrmModule],
})
export class AccountsModule {}
