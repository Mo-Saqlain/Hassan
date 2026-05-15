import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingPeriod } from './entities/accounting-period.entity';
import { PeriodsService } from './periods.service';
import { PeriodsController } from './periods.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AccountingPeriod])],
  controllers: [PeriodsController],
  providers: [PeriodsService],
  exports: [PeriodsService],
})
export class PeriodsModule {}
