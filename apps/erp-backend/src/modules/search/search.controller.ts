import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  /**
   * One box for everything: parties, items, and every document by its number —
   * invoices, bills, returns, receipts, payments, transfers, tickets,
   * deliveries. Needs at least 2 characters; returns grouped hits with a route
   * so the palette can navigate straight there.
   */
  @Get()
  global(@Query('q') q?: string, @Query('perGroup') perGroup?: string) {
    const n = Number(perGroup);
    return this.service.global(q ?? '', Number.isFinite(n) && n > 0 ? Math.min(n, 25) : 6);
  }
}
