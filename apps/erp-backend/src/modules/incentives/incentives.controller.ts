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
import { IncentivesService } from './incentives.service';
import { CreateIncentiveTargetDto } from './dto/create-incentive-target.dto';
import { UpdateIncentiveTargetDto } from './dto/update-incentive-target.dto';
import { CreateIncentiveAwardDto } from './dto/create-incentive-award.dto';

@Controller('incentives')
export class IncentivesController {
  constructor(private readonly service: IncentivesService) {}

  // Targets
  @Post('targets')
  createTarget(@Body() dto: CreateIncentiveTargetDto) {
    return this.service.createTarget(dto);
  }

  @Get('targets')
  findAllTargets() {
    return this.service.findAllTargets();
  }

  @Get('targets/progress')
  allTargetProgress() {
    return this.service.allTargetProgress();
  }

  /**
   * Per-item effective-cost adjustments derived from in-progress incentive
   * targets that have crossed their trigger threshold. POS reads this on
   * mount and refreshes after a sale to soften "selling below cost" warnings
   * and surface the recoverable credit on the cart row.
   */
  @Get('cost-adjustments')
  costAdjustments() {
    return this.service.effectiveCostAdjustments();
  }

  @Get('targets/:id')
  findTarget(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findTarget(id);
  }

  @Get('targets/:id/progress')
  targetProgress(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.targetProgress(id);
  }

  @Patch('targets/:id')
  updateTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncentiveTargetDto,
  ) {
    return this.service.updateTarget(id, dto);
  }

  @Delete('targets/:id')
  removeTarget(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeTarget(id);
  }

  // Awards
  @Post('awards')
  createAward(@Body() dto: CreateIncentiveAwardDto) {
    return this.service.createAward(dto);
  }

  @Get('awards')
  findAllAwards(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findAllAwards(from, to);
  }

  @Get('awards/total')
  awardsTotal(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.awardsTotal(from, to).then((sum) => ({ sum }));
  }

  @Delete('awards/:id')
  removeAward(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeAward(id);
  }
}
