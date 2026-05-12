import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashEntry } from './entities/cash-entry.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';
import { CashRegisterService } from './cash-register.service';
import { CashRegisterController } from './cash-register.controller';
import { Sale } from '../sales/entities/sale.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Account } from '../accounts/entities/account.entity';
import { FundTransfersModule } from '../fund-transfers/fund-transfers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashEntry,
      CashRegisterSession,
      Sale,
      Purchase,
      Payment,
      Account,
    ]),
    FundTransfersModule,
  ],
  controllers: [CashRegisterController],
  providers: [CashRegisterService],
  exports: [CashRegisterService],
})
export class CashRegisterModule {}
