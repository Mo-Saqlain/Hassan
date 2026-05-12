import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { SetScheduleDto } from './dto/set-schedule.dto';
import { RestoreDto } from './dto/restore.dto';

@Controller('backup')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  /** Trigger a new manual backup and persist it to the backup directory. */
  @Post()
  create(@Body('notes') notes?: string) {
    return this.service.createBackup('MANUAL', notes);
  }

  /** List recent backup files (most recent first, capped at 200). */
  @Get()
  list() {
    return this.service.list();
  }

  /** Snapshot the DB and send it back as a download — no file written. */
  @Get('download-now')
  async downloadNow(@Res() res: Response) {
    const { filename, json } = await this.service.streamSnapshot();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  }

  @Get('status')
  status() {
    return this.service.status();
  }

  @Get('schedule')
  getSchedule() {
    return this.service.getScheduledHour().then((hour) => ({ hour }));
  }

  @Post('schedule')
  setSchedule(@Body() dto: SetScheduleDto) {
    return this.service.setScheduledHour(dto.hour);
  }

  /** Download a previously-saved backup file by id. */
  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { row, stream } = await this.service.readFile(id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${row.fileName}"`,
    );
    stream.pipe(res);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  /**
   * Replay a backup JSON into the database. Destructive: wipes every
   * tracked table first. The caller must pass `confirm: "RESTORE"`.
   */
  @Post('restore')
  restore(@Body() dto: RestoreDto) {
    return this.service.restoreFromSnapshot(dto.snapshot, dto.confirm);
  }
}
