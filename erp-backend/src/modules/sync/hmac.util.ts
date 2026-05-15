import { createHmac, timingSafeEqual } from 'crypto';

export const SYNC_SIGNATURE_HEADER = 'x-sync-signature';
export const SYNC_TIMESTAMP_HEADER = 'x-sync-timestamp';
export const SYNC_SHOP_ID_HEADER = 'x-shop-id';

export const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;

export function signSyncRequest(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${body}`)
    .digest('hex');
}

export interface VerifyResult {
  ok: boolean;
  reason?:
    | 'missing-headers'
    | 'shop-id-mismatch'
    | 'timestamp-malformed'
    | 'timestamp-expired'
    | 'signature-mismatch';
}

export function verifySyncRequest(params: {
  expectedShopId: string;
  secret: string;
  shopId?: string;
  timestamp?: string;
  signature?: string;
  body: string;
  now?: number;
  maxSkewMs?: number;
}): VerifyResult {
  const {
    expectedShopId,
    secret,
    shopId,
    timestamp,
    signature,
    body,
    now = Date.now(),
    maxSkewMs = DEFAULT_MAX_SKEW_MS,
  } = params;

  if (!shopId || !timestamp || !signature) {
    return { ok: false, reason: 'missing-headers' };
  }
  if (shopId !== expectedShopId) {
    return { ok: false, reason: 'shop-id-mismatch' };
  }
  const ts = Date.parse(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'timestamp-malformed' };
  }
  if (Math.abs(now - ts) > maxSkewMs) {
    return { ok: false, reason: 'timestamp-expired' };
  }
  const expected = signSyncRequest(secret, timestamp, body);
  const expectedBuf = Buffer.from(expected, 'hex');
  let providedBuf: Buffer;
  try {
    providedBuf = Buffer.from(signature, 'hex');
  } catch {
    return { ok: false, reason: 'signature-mismatch' };
  }
  if (providedBuf.length !== expectedBuf.length) {
    return { ok: false, reason: 'signature-mismatch' };
  }
  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, reason: 'signature-mismatch' };
  }
  return { ok: true };
}
