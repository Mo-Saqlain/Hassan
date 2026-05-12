import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FundTransfer } from './entities/fund-transfer.entity';
import { FundTransfersService } from './fund-transfers.service';
import { FundTransfersController } from './fund-transfers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FundTransfer])],
  controllers: [FundTransfersController],
  providers: [FundTransfersService],
  exports: [FundTransfersService, TypeOrmModule],
})
export class FundTransfersModule {}
