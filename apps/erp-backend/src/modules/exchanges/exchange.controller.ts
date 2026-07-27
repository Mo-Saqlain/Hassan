import { Body, Controller, Post } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { CreateExchangeDto } from './dto/create-exchange.dto';

@Controller('exchanges')
export class ExchangeController {
  constructor(private readonly service: ExchangeService) {}

  @Post()
  create(@Body() dto: CreateExchangeDto) {
    return this.service.create(dto);
  }
}
