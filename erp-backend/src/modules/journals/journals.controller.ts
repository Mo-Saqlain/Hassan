import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { JournalEntry } from './entities/journal-entry.entity';

@Controller('journals')
export class JournalsController {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly entries: Repository<JournalEntry>,
  ) {}

  // Read-only list and detail — postings happen inside other services'
  // transactions, never via the HTTP layer.
  @Get()
  async list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const where =
      from && to
        ? { entryDate: Between(new Date(from), new Date(to)) }
        : {};
    return this.entries.find({
      where,
      relations: ['lines'],
      order: { entryDate: 'DESC', createdAt: 'DESC' },
      take: Math.min(Number(limit) || 200, 1000),
    });
  }

  @Get(':id')
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.entries.findOne({
      where: { id },
      relations: ['lines'],
    });
  }
}
