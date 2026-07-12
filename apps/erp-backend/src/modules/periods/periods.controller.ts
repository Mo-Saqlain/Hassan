import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PeriodsService } from './periods.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { ClosePeriodDto } from './dto/close-period.dto';

@Controller('periods')
export class PeriodsController {
  constructor(private readonly service: PeriodsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreatePeriodDto) {
    return this.service.create(dto);
  }

  @Post(':id/soft-close')
  softClose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClosePeriodDto,
  ) {
    return this.service.softClose(id, dto);
  }

  @Post(':id/hard-close')
  hardClose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClosePeriodDto,
  ) {
    return this.service.hardClose(id, dto);
  }

  @Post(':id/reopen')
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClosePeriodDto,
  ) {
    return this.service.reopen(id, dto);
  }
}
