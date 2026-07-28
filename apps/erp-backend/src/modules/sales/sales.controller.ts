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
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleVoucherDto } from './dto/create-sale-voucher.dto';
import { ReverseSaleDto } from './dto/reverse-sale.dto';
import { EditSaleDto } from './dto/edit-sale.dto';
import { SettleCommitmentDto } from './dto/settle-commitment.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly service: SalesService) {}

  // ─────────────────────────────────────────────────────────────────────
  // Static (non-param) GETs come FIRST in this file. Nest matches in
  // declaration order; if `@Get(':id')` is declared above `@Get('deferred/
  // upcoming')` or `@Get('overdue-bookings')`, the ParseUUIDPipe on the
  // dynamic route runs against the literal segment and throws 400
  // "Validation failed (uuid is expected)". Order matters — keep specific
  // routes above generic ones.
  // ─────────────────────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateSaleDto) {
    return this.service.create(dto);
  }

  /**
   * Bill-book Sales Voucher: one sale + N receipt splits, all in a single
   * atomic transaction. The whole submission rolls back if any split fails,
   * so an over-split or a stale account id cannot leave a partial sale
   * stranded. See `SalesService.createFromVoucher` for the journal-line
   * detail.
   */
  @Post('voucher')
  createVoucher(@Body() dto: CreateSaleVoucherDto) {
    return this.service.createFromVoucher(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  /**
   * Cross-sale view of deferred-cash collections coming due. Read by the
   * dashboard widget. Query params: `withinDays` (default 7), `status`
   * (default 'PENDING').
   */
  /**
   * Searchable, paged history. Declared above the `:id` route so the literal
   * segment isn't eaten by the UUID param.
   */
  @Get('search')
  search(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.search({ search, limit, offset });
  }

  @Get('deferred/upcoming')
  upcomingDeferred() {
    return this.service.upcomingDeferred();
  }

  /**
   * Sales with at least one BOOKED serial whose booking is >= minDays old.
   * The Overdue Bookings dashboard reads this to surface stuck advances
   * tying up inventory.
   */
  @Get('overdue-bookings')
  overdueBookings(@Query('minDays') minDays?: string) {
    const n = minDays != null ? parseInt(minDays, 10) : 7;
    return this.service.overdueBookings(Number.isFinite(n) ? n : 7);
  }

  /**
   * Receipt-backed warranty lookup for model-only items (no per-unit serial).
   * Three counter cases: customer has the receipt (by-invoice), receipt lost
   * so look the buyer up (by-customer), or buyer isn't in the system so search
   * the model in a date window (by-model). Declared above `:id` so the literal
   * `warranty` segment isn't eaten by the UUID route. See SalesService for the
   * card shape — shared with the per-serial lookup on the front end.
   */
  @Get('warranty/by-invoice/:invoiceNo')
  warrantyByInvoice(@Param('invoiceNo') invoiceNo: string) {
    return this.service.warrantyByInvoice(invoiceNo);
  }

  @Get('warranty/by-customer/:customerId')
  warrantyByCustomer(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.service.warrantyByCustomer(customerId);
  }

  @Get('warranty/by-model')
  warrantyByModel(
    @Query('itemId') itemId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.warrantyByModel(itemId, from, to);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /**
   * Correct a posted sale in place — same invoice number, same row. Body is a
   * full sale (the corrected version), plus `reason`.
   */
  @Patch(':id')
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditSaleDto,
  ) {
    const { reason, userId, ...sale } = dto;
    return this.service.edit(id, sale, { reason, userId });
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
   * Release-to-Floor: cancels a stuck booking, reverts the BOOKED serials
   * to AVAILABLE so they can be sold again. Idempotent — calling on an
   * already-released booking is a no-op. Does NOT refund the advance;
   * the owner has to do that manually via a Receipt-reversal.
   */
  @Post(':id/release-booking')
  releaseBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
  ) {
    return this.service.releaseBooking(id, { reason: body?.reason });
  }
}
