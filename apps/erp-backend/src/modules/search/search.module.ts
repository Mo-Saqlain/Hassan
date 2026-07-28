import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

/**
 * Read-only cross-entity search. Resolves repositories off the DataSource rather
 * than registering fourteen of them, since it only ever reads.
 */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
