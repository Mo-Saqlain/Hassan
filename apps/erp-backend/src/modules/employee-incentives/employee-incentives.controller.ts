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
import { EmployeeIncentivesService } from './employee-incentives.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Controller('employee-incentives')
export class EmployeeIncentivesController {
  constructor(private readonly service: EmployeeIncentivesService) {}

  // Rules
  @Post('rules') createRule(@Body() dto: CreateRuleDto) {
    return this.service.createRule(dto);
  }

  @Get('rules') findAllRules(@Query('employeeId') employeeId?: string) {
    return this.service.findAllRules(employeeId);
  }

  @Get('rules/:id') findRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findRule(id);
  }

  @Patch('rules/:id') updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.service.updateRule(id, dto);
  }

  @Delete('rules/:id') removeRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeRule(id);
  }

  // Calculations
  @Get('compute') compute(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.computeForPeriod(from, to, employeeId);
  }

  @Get('total') total(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service
      .totalForPeriod(from, to)
      .then((sum) => ({ sum }));
  }
}
