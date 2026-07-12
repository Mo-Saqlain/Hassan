import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SYNC_SHOP_ID_HEADER,
  SYNC_SIGNATURE_HEADER,
  SYNC_TIMESTAMP_HEADER,
  verifySyncRequest,
} from './hmac.util';

/**
 * Validates the HMAC-SHA256 signature on incoming /sync/push requests.
 *
 * Configuration (cloud-side env):
 *   - SHOP_ID            shop identifier the cloud expects (e.g. "hassan-main")
 *   - SHOP_SYNC_SECRET   shared secret (≥ 32 random bytes, hex/base64 OK)
 *
 * If either env var is missing, the guard rejects every request. There is
 * no dev-bypass — running unsigned would defeat the entire purpose.
 */
@Injectable()
export class SyncSignatureGuard implements CanActivate {
  private readonly logger = new Logger(SyncSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();

    const expectedShopId = process.env.SHOP_ID;
    const secret = process.env.SHOP_SYNC_SECRET;
    if (!expectedShopId || !secret) {
      this.logger.error(
        'SHOP_ID / SHOP_SYNC_SECRET not configured — rejecting sync push.',
      );
      throw new UnauthorizedException('Sync receiver is not configured.');
    }

    const headerOf = (name: string): string | undefined => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };

    // We sign over the canonical JSON.stringify of the parsed body. Both
    // sides are Node.js running this same module, so JSON.parse → JSON.stringify
    // preserves key order. If the project ever grows a non-Node local node,
    // switch to a canonical-JSON serializer on both sides.
    const body = JSON.stringify(req.body ?? {});

    const result = verifySyncRequest({
      expectedShopId,
      secret,
      shopId: headerOf(SYNC_SHOP_ID_HEADER),
      timestamp: headerOf(SYNC_TIMESTAMP_HEADER),
      signature: headerOf(SYNC_SIGNATURE_HEADER),
      body,
    });

    if (!result.ok) {
      this.logger.warn(`Sync push rejected: ${result.reason}`);
      throw new UnauthorizedException(`Sync signature: ${result.reason}`);
    }

    return true;
  }
}
