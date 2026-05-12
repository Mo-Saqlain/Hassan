import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CashRegisterService } from './cash-register.service';
import { CreateCashEntryDto } from './dto/create-cash-entry.dto';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';

@Controller('cash-register')
export class CashRegisterController {
  constructor(private readonly service: CashRegisterService) {}

  // Entries
  @Post()
  create(@Body() dto: CreateCashEntryDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findAll(from, to);
  }

  @Get('day')
  day(@Query('date') date?: string) {
    return this.service.dailyBook(date);
  }

  @Get('summary')
  summary(@Query('from') from: string, @Query('to') to: string) {
    return this.service.summary(from, to);
  }

  // Sessions
  @Get('sessions')
  listSessions(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.listSessions(from, to);
  }

  @Get('sessions/status')
  sessionStatus(@Query('date') date?: string) {
    return this.service.sessionStatus(date);
  }

  @Post('sessions/open')
  openSession(@Body() dto: OpenSessionDto) {
    return this.service.openSession(dto);
  }

  @Post('sessions/:date/close')
  closeSession(@Param('date') date: string, @Body() dto: CloseSessionDto) {
    return this.service.closeSession(date, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
