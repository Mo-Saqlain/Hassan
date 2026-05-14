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
import { CurrentUser, Public } from './auth.decorators';
import { User } from './entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

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
}
