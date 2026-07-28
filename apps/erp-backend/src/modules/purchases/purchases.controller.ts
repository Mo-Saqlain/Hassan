import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ReversePurchaseDto } from './dto/reverse-purchase.dto';
import { EditPurchaseDto } from './dto/edit-purchase.dto';
import { ImportRowsDto } from '../../common/csv-import';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}

  @Post()
  create(@Body() dto: CreatePurchaseDto) {
    return this.service.create(dto);
  }

  @Post('import')
  importCsv(@Body() body: ImportRowsDto) {
    return this.service.importRows(body.rows);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /** Correct a posted bill in place — same bill number, same row. */
  @Patch(':id')
  edit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditPurchaseDto) {
    const { reason, userId, ...purchase } = dto;
    return this.service.edit(id, purchase, { reason, userId });
  }

  @Post(':id/reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePurchaseDto,
  ) {
    return this.service.reverse(id, dto);
  }
}
