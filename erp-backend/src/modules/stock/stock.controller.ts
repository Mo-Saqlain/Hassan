import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';

@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get('summary')
  summary() {
    return this.service.stockSummary();
  }

  @Get('on-hand')
  onHand(
    @Query('itemId') itemId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.service.getOnHand(itemId, storeId).then((qty) => ({ itemId, storeId, qty }));
  }

  @Get('movements')
  movements(
    @Query('itemId') itemId?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.service.listMovements(itemId, storeId);
  }

  @Post('adjust')
  adjust(@Body() dto: StockAdjustmentDto) {
    return this.service.adjust(dto);
  }
}
