import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { User } from './entities/user.entity';
import { UserAccessRequest } from './entities/user-access-request.entity';
import { UserLoginEvent } from './entities/user-login-event.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserAccessRequest, UserLoginEvent]),
  ],
  controllers: [UsersController, AuthController],
  providers: [
    UsersService,
    // Global guard — every controller route requires authentication
    // unless it carries the `@Public()` decorator.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [UsersService],
})
export class UsersModule {}
