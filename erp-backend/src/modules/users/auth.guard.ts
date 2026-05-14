import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from './users.service';
import { PUBLIC_KEY, SUPERUSER_KEY } from './auth.decorators';

/**
 * Global guard: every request must carry a valid session token in the
 * `Authorization: Bearer <token>` header, unless the route is marked
 * with `@Public()`. Routes marked `@SuperuserOnly()` additionally
 * require the resolved user's role to be SUPERUSER.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined =
      req.headers?.authorization || req.headers?.Authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : undefined;
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }
    const user = await this.users.resolveSession(token);
    if (!user) {
      throw new UnauthorizedException('Session expired or invalid');
    }
    req.user = user;

    const needsSuper = this.reflector.getAllAndOverride<boolean>(SUPERUSER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (needsSuper && user.role !== 'SUPERUSER') {
      throw new ForbiddenException('Superuser access required');
    }
    return true;
  }
}
