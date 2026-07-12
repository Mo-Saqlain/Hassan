import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Password hashing utility. Uses Node's built-in `scrypt` so we don't
 * need a native bcrypt dependency on Windows / Electron.
 *
 * Stored format: `scrypt:<saltHex>:<hashHex>`
 *   - salt is 16 bytes (32 hex chars)
 *   - hash is 64 bytes (128 hex chars)
 *
 * `verifyPassword` uses constant-time comparison so the time taken does
 * not leak information about how many leading bytes matched.
 */

const KEY_LEN = 64;
const SALT_LEN = 16;

export function hashPassword(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(plain, salt, KEY_LEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(plain, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Opaque session token returned to the client after a successful login. */
export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}
