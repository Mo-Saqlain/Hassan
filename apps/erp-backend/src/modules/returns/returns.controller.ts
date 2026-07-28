import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { ReverseReturnDto } from './dto/reverse-return.dto';

@Controller()
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Post('sale-returns')
  createSaleReturn(@Body() dto: CreateSaleReturnDto) {
    return this.service.createSaleReturn(dto);
  }

  @Get('sale-returns')
  listSaleReturns() {
    return this.service.listSaleReturns();
  }

  @Get('sale-returns/:id')
  getSaleReturn(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findSaleReturn(id);
  }

  /** Undo a sale return booked in error. Keeps the row, sets `reversedAt`. */
  @Post('sale-returns/:id/reverse')
  reverseSaleReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseReturnDto,
  ) {
    return this.service.reverseSaleReturn(id, dto);
  }

  @Post('purchase-returns')
  createPurchaseReturn(@Body() dto: CreatePurchaseReturnDto) {
    return this.service.createPurchaseReturn(dto);
  }

  @Get('purchase-returns')
  listPurchaseReturns() {
    return this.service.listPurchaseReturns();
  }

  @Get('purchase-returns/:id')
  getPurchaseReturn(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findPurchaseReturn(id);
  }

  /** Undo a purchase return booked in error. Keeps the row, sets `reversedAt`. */
  @Post('purchase-returns/:id/reverse')
  reversePurchaseReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseReturnDto,
  ) {
    return this.service.reversePurchaseReturn(id, dto);
  }
}
