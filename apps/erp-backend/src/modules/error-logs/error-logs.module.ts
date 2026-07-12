import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrorLog } from './entities/error-log.entity';
import { ErrorLogsService } from './error-logs.service';
import { ErrorLogsController } from './error-logs.controller';
import { ErrorLogFilter } from './error-log.filter';

@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog])],
  controllers: [ErrorLogsController],
  providers: [ErrorLogsService, ErrorLogFilter],
  exports: [ErrorLogsService, ErrorLogFilter],
})
export class ErrorLogsModule {}
