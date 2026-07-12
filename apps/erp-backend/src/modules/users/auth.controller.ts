import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService, toPublic } from './users.service';
import { LoginDto } from './dto/login.dto';
import { RequestAccessDto } from './dto/request-access.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ReauthenticateDto } from './dto/reauthenticate.dto';
import { CurrentUser, Public } from './auth.decorators';
import { User } from './entities/user.entity';
import { ReauthService } from './reauth.service';
import { verifyPassword } from './password.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly reauth: ReauthService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.users.login(dto.username, dto.password, {
      ipAddress:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Public()
  @Post('request-access')
  requestAccess(@Body() dto: RequestAccessDto) {
    return this.users.requestAccess(dto);
  }

  @Get('me')
  me(@CurrentUser() user: User | undefined) {
    if (!user) throw new UnauthorizedException();
    return toPublic(user);
  }

  @Post('logout')
  logout(@CurrentUser() user: User | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.users.logout(user);
  }

  @Post('change-password')
  changeOwnPassword(
    @CurrentUser() user: User | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.users.changeOwnPassword(
      user,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * One-shot, 60-second reauth token. The frontend POSTs the current
   * password (the same one used at login) and gets back a short-lived
   * token that high-privilege endpoints (backup restore / download)
   * require via the `X-Reauth-Token` header. The token is consumed on
   * first use — even if the action fails afterwards, the user must
   * reauthenticate again.
   */
  @Post('reauthenticate')
  reauthenticate(
    @CurrentUser() user: User | undefined,
    @Body() dto: ReauthenticateDto,
  ) {
    if (!user) throw new UnauthorizedException();
    if (!verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Password incorrect.');
    }
    return this.reauth.issue(user.id);
  }
}
