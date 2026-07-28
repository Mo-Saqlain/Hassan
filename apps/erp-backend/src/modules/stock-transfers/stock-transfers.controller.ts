import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { ReverseStockTransferDto } from './dto/reverse-stock-transfer.dto';
import { EditStockTransferDto } from './dto/edit-stock-transfer.dto';

@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}

  @Post() create(@Body() dto: CreateStockTransferDto) {
    return this.service.create(dto);
  }

  @Get() findAll(
    @Query('fromStoreId') fromStoreId?: string,
    @Query('toStoreId') toStoreId?: string,
  ) {
    return this.service.findAll(fromStoreId, toStoreId);
  }

  /** Correct a posted transfer in place — same number, same row. */
  @Patch(':id')
  edit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditStockTransferDto) {
    const { reason, userId, ...transfer } = dto;
    return this.service.edit(id, transfer, { reason, userId });
  }

  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /** Undo a transfer sent to the wrong store. Keeps the row, books the mirror
   *  movements. */
  @Post(':id/reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseStockTransferDto,
  ) {
    return this.service.reverse(id, dto);
  }
}
