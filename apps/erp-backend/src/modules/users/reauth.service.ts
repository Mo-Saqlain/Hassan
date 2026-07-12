import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';

interface ReauthRecord {
  userId: string;
  expiresAt: number;
}

const REAUTH_TTL_MS = 60 * 1000;
const REAUTH_HEADER = 'x-reauth-token';

/**
 * Short-lived, one-shot reauth tokens. The frontend obtains one by POSTing
 * the current password to `/auth/reauthenticate`; high-privilege endpoints
 * (backup restore / download) consume it via the `X-Reauth-Token` header.
 *
 * Stored in-memory: tokens vanish on process restart, which is acceptable —
 * the user simply reauths again. No cross-process / cross-pod sharing
 * because the local node is a single process and the cloud instance is
 * accessed by the same admin.
 */
@Injectable()
export class ReauthService {
  private readonly tokens = new Map<string, ReauthRecord>();

  issue(userId: string): { token: string; expiresAt: string } {
    this.gc();
    const token = randomBytes(24).toString('hex');
    const expiresAt = Date.now() + REAUTH_TTL_MS;
    this.tokens.set(token, { userId, expiresAt });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Validates and **consumes** (single-use) a token for a given user. Returns
   * silently on success; throws UnauthorizedException on absent / expired /
   * wrong-user token.
   */
  consume(token: string | undefined, userId: string): void {
    this.gc();
    if (!token) {
      throw new UnauthorizedException('Reauth token required for this action.');
    }
    const rec = this.tokens.get(token);
    if (!rec) {
      throw new UnauthorizedException('Reauth token invalid or already used.');
    }
    // One-shot: remove immediately, even on userId mismatch (so a leaked
    // token can't be replayed against multiple endpoints).
    this.tokens.delete(token);
    if (rec.expiresAt < Date.now()) {
      throw new UnauthorizedException('Reauth token expired (60-second window).');
    }
    if (rec.userId !== userId) {
      throw new UnauthorizedException('Reauth token does not belong to this user.');
    }
  }

  /** Drops stale records lazily — runs at the top of every issue/consume call. */
  private gc(): void {
    const now = Date.now();
    for (const [t, r] of this.tokens) {
      if (r.expiresAt < now) this.tokens.delete(t);
    }
  }
}

export const REAUTH_HEADER_NAME = REAUTH_HEADER;
