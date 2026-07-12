import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ItemSerialsService } from './item-serials.service';
import { RegisterSerialsDto } from './dto/register-serials.dto';
import { ItemSerialStatus } from './entities/item-serial.entity';
import { Public } from '../users/auth.decorators';

@Controller('item-serials')
export class ItemSerialsController {
  constructor(private readonly service: ItemSerialsService) {}

  /** Authenticated browse — used by the Items tab to surface known serials,
   *  and by the receipt printout to render per-line serials + warranty end. */
  @Get()
  list(
    @Query('itemId') itemId?: string,
    @Query('status') status?: ItemSerialStatus,
    @Query('saleInvoiceNo') saleInvoiceNo?: string,
  ) {
    return this.service.list({ itemId, status, saleInvoiceNo });
  }

  /** POS dropdown of in-stock serials for a specific item. */
  @Get('available')
  available(@Query('itemId') itemId: string) {
    return this.service.listAvailableForItem(itemId);
  }

  /** Manually register serials (purchase-form post-hoc backfill). */
  @Post()
  register(@Body() dto: RegisterSerialsDto) {
    return this.service.registerStock(dto);
  }

  /**
   * Mint N internal-generated serials for an unbranded local item. POS
   * calls this when the salesman clicks "+ Generate & Print Local ID" on
   * a cart line. Returns the freshly-saved serials in IN_STOCK + AVAILABLE
   * state; the front-end injects them into the line's serial textarea.
   */
  @Post('generate-local')
  generateLocal(@Body() body: { itemId: string; count: number }) {
    return this.service.generateLocalSerials({
      itemId: body.itemId,
      count: Number(body.count) || 1,
    });
  }

  /**
   * Public warranty lookup — the route a customer hits via QR / website /
   * walk-in counter. Returns only non-PII data: model, status, sold date,
   * warranty window, active flag. No customer name. Anonymous.
   */
  @Public()
  @Get('warranty/:serial')
  warrantyBySerial(@Param('serial') serial: string) {
    return this.service.lookupWarranty(serial);
  }
}
