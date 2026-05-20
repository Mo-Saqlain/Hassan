import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ReverseSaleDto } from './dto/reverse-sale.dto';
import { SettleCommitmentDto } from './dto/settle-commitment.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Post()
  create(@Body() dto: CreateSaleDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseSaleDto,
  ) {
    return this.service.reverse(id, dto);
  }

  @Post(':id/settle-commitment')
  settleCommitment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettleCommitmentDto,
  ) {
    return this.service.settleCommitment(id, dto);
  }

  /**
   * Cross-sale view of deferred-cash collections coming due. Read by the
   * dashboard widget. Query params: `withinDays` (default 7), `status`
   * (default 'PENDING').
   */
  @Get('deferred/upcoming')
  upcomingDeferred() {
    return this.service.upcomingDeferred();
  }
}
