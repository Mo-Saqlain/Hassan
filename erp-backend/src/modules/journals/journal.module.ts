import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { JournalService } from './journal.service';
import { JournalsController } from './journals.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry, JournalLine])],
  controllers: [JournalsController],
  providers: [JournalService],
  // PeriodsModule is @Global so we don't need to import it here.
  exports: [JournalService, TypeOrmModule],
})
export class JournalsModule {}
