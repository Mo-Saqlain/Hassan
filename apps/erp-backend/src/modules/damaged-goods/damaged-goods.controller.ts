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
import { DamagedGoodsService } from './damaged-goods.service';
import { CreateDamagedGoodDto } from './dto/create-damaged-good.dto';
import { UpdateDamageStatusDto } from './dto/update-status.dto';
import { DamageStatus } from './entities/damaged-good.entity';

@Controller('damaged-goods')
export class DamagedGoodsController {
  constructor(private readonly service: DamagedGoodsService) {}

  @Post() create(@Body() dto: CreateDamagedGoodDto) {
    return this.service.create(dto);
  }

  @Get() findAll(@Query('status') status?: DamageStatus) {
    return this.service.findAll(status);
  }

  @Get('tally') tally() {
    return this.service.tally();
  }

  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/status') updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDamageStatusDto,
  ) {
    return this.service.updateStatus(id, dto);
  }

  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
