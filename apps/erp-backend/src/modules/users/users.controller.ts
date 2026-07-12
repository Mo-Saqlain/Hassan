import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { CurrentUser, SuperuserOnly } from './auth.decorators';
import { User } from './entities/user.entity';
import { AccessRequestStatus } from './entities/user-access-request.entity';

/**
 * Every route here is superuser-only. The `@SuperuserOnly()` decorator
 * is applied at the class level so the `AuthGuard` rejects regular
 * users with 403 before any handler runs.
 *
 * Route order matters: the more specific paths ("access-requests/…",
 * "login-events/…") are declared before the `:id` user routes so
 * Nest's matcher doesn't swallow them.
 */
@SuperuserOnly()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ─── Access requests ────────────────────────────────────────────────

  @Get('access-requests')
  listRequests(@Query('status') status?: AccessRequestStatus) {
    return this.users.listAccessRequests(status);
  }

  @Get('access-requests/pending-count')
  pendingCount() {
    return this.users.pendingAccessRequestCount().then((count) => ({ count }));
  }

  @Post('access-requests/:id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRequestDto,
    @CurrentUser() actor: User | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    return this.users.approveAccessRequest(id, dto, actor);
  }

  @Post('access-requests/:id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: User | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    return this.users.rejectAccessRequest(id, actor);
  }

  @Delete('access-requests/:id')
  removeRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.removeAccessRequest(id);
  }

  // ─── Login events ───────────────────────────────────────────────────

  @Get('login-events')
  loginEvents(
    @Query('unseen') unseen?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.listLoginEvents({
      unseen: unseen === 'true' || unseen === '1',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('login-events/unseen-count')
  unseenCount() {
    return this.users.unseenLoginCount().then((count) => ({ count }));
  }

  @Post('login-events/mark-seen')
  markSeen() {
    return this.users.markLoginEventsSeen();
  }

  @Delete('login-events')
  clearLoginEvents() {
    return this.users.clearLoginEvents();
  }

  // ─── Users CRUD ─────────────────────────────────────────────────────

  @Get()
  list() {
    return this.users.listUsers();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.createUser(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: User | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    if (id === actor.id && dto.role && dto.role !== actor.role) {
      throw new ForbiddenException(
        'You cannot change your own role — ask another superuser to do it.',
      );
    }
    if (id === actor.id && dto.isActive === false) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    return this.users.updateUser(id, dto, actor);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: User | undefined,
  ) {
    if (!actor) throw new UnauthorizedException();
    return this.users.removeUser(id, actor);
  }
}
