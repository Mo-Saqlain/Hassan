import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { SetScheduleDto } from './dto/set-schedule.dto';
import { RestoreDto } from './dto/restore.dto';
import { CurrentUser } from '../users/auth.decorators';
import { User } from '../users/entities/user.entity';
import { verifyPassword } from '../users/password.util';

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
   * tracked table first.
   *
   * Two safety gates:
   *   1. `confirm` must literally equal "RESTORE".
   *   2. The caller re-supplies their current account password — we
   *      verify it against the signed-in user, so a left-open session
   *      isn't enough to nuke the shop's data.
   *
   * Before applying the snapshot the service also auto-creates a
   * pre-restore snapshot of the current DB ("AUTO" trigger) so the
   * action is reversible.
   */
  @Post('restore')
  async restore(
    @Body() dto: RestoreDto,
    @CurrentUser() user: User | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    if (!verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException(
        'Password did not match — restore aborted. Please re-enter your account password.',
      );
    }
    return this.service.restoreFromSnapshot(dto.snapshot, dto.confirm, {
      actorUsername: user.username,
    });
  }
}
