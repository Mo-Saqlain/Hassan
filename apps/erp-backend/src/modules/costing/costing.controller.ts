import { Body, Controller, Get, Post } from '@nestjs/common';
import { RecostService } from './recost.service';
import { RecostDto } from './dto/recost.dto';
import { SuperuserOnly } from '../users/auth.decorators';

@Controller('costing')
export class CostingController {
  constructor(private readonly service: RecostService) {}

  /** How many items currently have a purchase history to replay. */
  @Get('status')
  async status() {
    return { itemsWithCostHistory: await this.service.itemsWithCostHistory() };
  }

  /**
   * Re-derive weighted-average cost from the surviving documents.
   *
   * Superuser-only: with `resnapshotSales` it rewrites `costAtSaleTime` on past
   * sale lines, which moves historical COGS and margin figures. Editing or
   * reversing a voucher already recosts the items it touched automatically —
   * this endpoint is for the one-off backfill of averages that drifted before
   * recosting existed, or after a bulk data fix.
   */
  @SuperuserOnly()
  @Post('recompute')
  async recompute(@Body() dto: RecostDto) {
    if (dto.itemIds?.length) {
      const details = await this.service.recomputeItems(dto.itemIds, {
        resnapshotSales: dto.resnapshotSales,
      });
      return {
        items: details.length,
        changed: details.filter((d) => d.changed).length,
        resnapshotted: details.reduce((s, d) => s + d.resnapshotted, 0),
        details,
      };
    }
    return this.service.recomputeAll({ resnapshotSales: dto.resnapshotSales });
  }
}
