import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceTicket } from './entities/service-ticket.entity';
import { ServiceTicketsService } from './service-tickets.service';
import { ServiceTicketsController } from './service-tickets.controller';
import { SequenceModule } from '../sequences/sequence.module';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceTicket]), SequenceModule],
  controllers: [ServiceTicketsController],
  providers: [ServiceTicketsService],
  exports: [ServiceTicketsService],
})
export class ServiceTicketsModule {}
