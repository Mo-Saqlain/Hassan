import {
  ExecutionContext,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { User } from './entities/user.entity';

/**
 * Mark a route (or whole controller) as accessible without a valid
 * session — used for /auth/login, /auth/request-access, /sync/push,
 * and /health.
 */
export const PUBLIC_KEY = 'auth:public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Mark a route (or whole controller) as superuser-only. The `AuthGuard`
 * will reject non-superuser requests with 403.
 */
export const SUPERUSER_KEY = 'auth:superuser';
export const SuperuserOnly = () => SetMetadata(SUPERUSER_KEY, true);

/**
 * Convenience parameter decorator: `@CurrentUser() user: User` injects
 * the user attached to the request by `AuthGuard`.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req?.user;
  },
);
