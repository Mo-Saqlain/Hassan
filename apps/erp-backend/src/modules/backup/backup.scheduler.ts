import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupService } from './backup.service';

@Injectable()
export class BackupScheduler {
  private readonly logger = new Logger(BackupScheduler.name);

  constructor(private readonly service: BackupService) {}

  /**
   * Tick once an hour. The service checks whether the current hour matches
   * the configured backup hour AND no backup has been taken today — only
   * then does it actually create the snapshot. Polling hourly (rather than
   * scheduling a precise cron) lets the user change the scheduled hour
   * via the API without restarting the backend.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async hourlyTick(): Promise<void> {
    try {
      const result = await this.service.runScheduledIfDue();
      if (result) {
        this.logger.log(
          `Auto-backup completed: ${result.fileName} (${(result.sizeBytes / 1024).toFixed(1)} KB)`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Auto-backup failed: ${e?.message ?? e}`);
    }
  }
}
