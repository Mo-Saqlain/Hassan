import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ServiceTicketsService } from './service-tickets.service';
import {
  CreateServiceTicketDto,
  UpdateServiceTicketDto,
} from './dto/create-service-ticket.dto';

@Controller('service-tickets')
export class ServiceTicketsController {
  constructor(private readonly service: ServiceTicketsService) {}

  @Get()
  list() {
    return this.service.findAll();
  }

  @Get('tally')
  tally() {
    return this.service.tally();
  }

  @Post()
  create(@Body() dto: CreateServiceTicketDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceTicketDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
