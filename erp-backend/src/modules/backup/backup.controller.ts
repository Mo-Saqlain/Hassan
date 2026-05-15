import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
import { CurrentUser, SuperuserOnly } from '../users/auth.decorators';
import { User } from '../users/entities/user.entity';
import { verifyPassword } from '../users/password.util';
import { ReauthService, REAUTH_HEADER_NAME } from '../users/reauth.service';

@Controller('backup')
export class BackupController {
  constructor(
    private readonly service: BackupService,
    private readonly reauth: ReauthService,
  ) {}

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

  /**
   * Snapshot the DB and send it back as a download — no file written.
   * Restricted to SUPERUSER (matches the existing two-role model). No
   * reauth gate: download is read-only and confidentiality isn't the
   * threat model — the priority is making backups easy to grab.
   */
  @SuperuserOnly()
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

  /** Download a previously-saved backup file by id. SUPERUSER role required. */
  @SuperuserOnly()
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
   * Replay a backup JSON into the database. Destructive — wipes every
   * tracked table first.
   *
   * Safety gates (all must pass — this is integrity protection, not
   * confidentiality):
   *   1. SUPERUSER role (enforced by `@SuperuserOnly`).
   *   2. Either `X-Reauth-Token` header (call `POST /auth/reauthenticate`
   *      first to get one) OR the legacy `password` field in the body.
   *      The reauth token is one-shot and lasts 60 seconds — prevents a
   *      left-open session from nuking the DB by accident.
   *   3. `confirm` must literally equal "RESTORE".
   *   4. Before replaying, the service auto-creates a pre-restore snapshot
   *      ("AUTO" trigger) so the action is reversible.
   */
  @SuperuserOnly()
  @Post('restore')
  async restore(
    @Body() dto: RestoreDto,
    @CurrentUser() user: User | undefined,
    @Headers(REAUTH_HEADER_NAME) reauthToken: string | undefined,
  ) {
    if (!user) throw new UnauthorizedException();

    // Reauth gate: prefer the one-shot token header. Fall back to the
    // legacy password field for older clients.
    if (reauthToken) {
      this.reauth.consume(reauthToken, user.id);
    } else if (dto.password) {
      if (!verifyPassword(dto.password, user.passwordHash)) {
        throw new UnauthorizedException(
          'Password did not match — restore aborted. Please re-enter your account password.',
        );
      }
    } else {
      throw new UnauthorizedException(
        'Restore requires reauthentication: call POST /auth/reauthenticate to get an X-Reauth-Token, or include `password` in the body.',
      );
    }

    if (!dto.snapshot) {
      throw new UnauthorizedException(
        'Restore body must include `snapshot: { version, data }`.',
      );
    }

    return this.service.restoreFromSnapshot(dto.snapshot, dto.confirm, {
      actorUsername: user.username,
    });
  }
}
