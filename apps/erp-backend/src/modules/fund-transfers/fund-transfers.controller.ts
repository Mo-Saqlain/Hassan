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
import { FundTransfersService } from './fund-transfers.service';
import { CreateFundTransferDto } from './dto/create-fund-transfer.dto';
import { ReverseFundTransferDto } from './dto/reverse-fund-transfer.dto';

@Controller('fund-transfers')
export class FundTransfersController {
  constructor(private readonly service: FundTransfersService) {}

  @Post()
  create(@Body() dto: CreateFundTransferDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findAll(from, to);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseFundTransferDto,
  ) {
    return this.service.reverse(id, dto);
  }
}
