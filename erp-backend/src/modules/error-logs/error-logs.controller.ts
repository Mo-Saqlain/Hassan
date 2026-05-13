import { Controller, Delete, Get, Query } from '@nestjs/common';
import { ErrorLogsService } from './error-logs.service';
import { ErrorLevel } from './entities/error-log.entity';

@Controller('error-logs')
export class ErrorLogsController {
  constructor(private readonly service: ErrorLogsService) {}

  @Get()
  findAll(
    @Query('level') level?: ErrorLevel,
    @Query('source') source?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      level,
      source,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Delete()
  clear() {
    return this.service.clear();
  }
}
