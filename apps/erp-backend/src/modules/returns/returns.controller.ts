import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { ReverseReturnDto } from './dto/reverse-return.dto';
import { EditSaleReturnDto } from './dto/edit-sale-return.dto';
import { EditPurchaseReturnDto } from './dto/edit-purchase-return.dto';

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

  /** Correct a sale return in place — same return number, same row. */
  @Patch('sale-returns/:id')
  editSaleReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditSaleReturnDto,
  ) {
    const { editReason, userId, ...ret } = dto;
    return this.service.editSaleReturn(id, ret, { reason: editReason, userId });
  }

  /** Undo a sale return booked in error. Keeps the row, sets `reversedAt`. */
  @Post('sale-returns/:id/reverse')
  reverseSaleReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseReturnDto,
  ) {
    return this.service.reverseSaleReturn(id, dto);
  }

  @Delete('sale-returns/:id')
  removeSaleReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reason') reason?: string,
  ) {
    return this.service.reverseSaleReturn(id, { reason: reason || 'Deleted by user' });
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

  /** Correct a purchase return in place — same return number, same row. */
  @Patch('purchase-returns/:id')
  editPurchaseReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditPurchaseReturnDto,
  ) {
    const { editReason, userId, ...ret } = dto;
    return this.service.editPurchaseReturn(id, ret, { reason: editReason, userId });
  }

  @Post('purchase-returns/:id/reverse')
  reversePurchaseReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseReturnDto,
  ) {
    return this.service.reversePurchaseReturn(id, dto);
  }

  @Delete('purchase-returns/:id')
  removePurchaseReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reason') reason?: string,
  ) {
    return this.service.reversePurchaseReturn(id, { reason: reason || 'Deleted by user' });
  }
}
