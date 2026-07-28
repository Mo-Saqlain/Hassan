import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { CreateExchangeDto } from './dto/create-exchange.dto';
import { ReverseExchangeDto } from './dto/reverse-exchange.dto';

@Controller('exchanges')
export class ExchangeController {
  constructor(private readonly service: ExchangeService) {}

  @Post()
  create(@Body() dto: CreateExchangeDto) {
    return this.service.create(dto);
  }

  /** Exchange history. An exchange is keyed by its give-back sale-return id —
   *  there is no exchanges table, so the row composes the legs. */
  @Get()
  list() {
    return this.service.list();
  }

  @Get(':saleReturnId')
  findOne(@Param('saleReturnId', ParseUUIDPipe) saleReturnId: string) {
    return this.service.findOne(saleReturnId);
  }

  /** Undo every leg at once — replacement sale, give-back, supplier credit. */
  @Post(':saleReturnId/reverse')
  reverse(
    @Param('saleReturnId', ParseUUIDPipe) saleReturnId: string,
    @Body() dto: ReverseExchangeDto,
  ) {
    return this.service.reverse(saleReturnId, dto);
  }
}
