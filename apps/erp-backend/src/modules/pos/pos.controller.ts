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
import { PosService } from './pos.service';
import { StartSessionDto } from './dto/start-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CheckoutDto } from './dto/checkout.dto';

@Controller('pos')
export class PosController {
  constructor(private readonly service: PosService) {}

  // Sessions
  @Post('sessions')
  startSession(@Body() dto: StartSessionDto) {
    return this.service.startSession(dto);
  }

  @Get('sessions')
  listSessions() {
    return this.service.listSessions();
  }

  @Get('sessions/active')
  active() {
    return this.service.getActiveSession();
  }

  @Get('sessions/:id')
  findSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findSession(id);
  }

  @Post('sessions/:id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSessionDto,
  ) {
    return this.service.closeSession(id, dto);
  }

  // Item lookup for the POS UI (mirror of /items/lookup, kept here for clarity).
  @Get('lookup')
  lookup(@Query('code') code: string) {
    return this.service.lookupItem(code);
  }

  // Cart
  @Get('sessions/:id/cart')
  cart(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listCart(id);
  }

  @Post('sessions/:id/cart')
  addToCart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddToCartDto,
  ) {
    return this.service.addToCart(id, dto);
  }

  @Patch('cart/:cartItemId')
  updateCartItem(
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.service.updateCartItem(cartItemId, dto);
  }

  @Delete('cart/:cartItemId')
  removeCartItem(
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
  ) {
    return this.service.removeCartItem(cartItemId);
  }

  @Delete('sessions/:id/cart')
  clearCart(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.clearCart(id);
  }

  // Checkout
  @Post('sessions/:id/checkout')
  checkout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.service.checkout(id, dto);
  }
}
