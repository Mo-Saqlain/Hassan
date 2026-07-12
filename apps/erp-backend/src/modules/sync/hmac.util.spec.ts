import { signSyncRequest, verifySyncRequest } from './hmac.util';

describe('sync HMAC util', () => {
  const SECRET = 'a'.repeat(64);
  const SHOP = 'hassan-main';

  it('signSyncRequest is deterministic and uses sha256-hex', () => {
    const sig = signSyncRequest(SECRET, '2026-05-15T10:00:00.000Z', '{"x":1}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    const sig2 = signSyncRequest(SECRET, '2026-05-15T10:00:00.000Z', '{"x":1}');
    expect(sig).toBe(sig2);
  });

  it('changes when the body changes', () => {
    const a = signSyncRequest(SECRET, '2026-05-15T10:00:00.000Z', '{"x":1}');
    const b = signSyncRequest(SECRET, '2026-05-15T10:00:00.000Z', '{"x":2}');
    expect(a).not.toBe(b);
  });

  it('changes when the timestamp changes', () => {
    const a = signSyncRequest(SECRET, '2026-05-15T10:00:00.000Z', '{"x":1}');
    const b = signSyncRequest(SECRET, '2026-05-15T10:00:01.000Z', '{"x":1}');
    expect(a).not.toBe(b);
  });

  it('changes when the secret changes', () => {
    const a = signSyncRequest(SECRET, '2026-05-15T10:00:00.000Z', '{"x":1}');
    const b = signSyncRequest('b'.repeat(64), '2026-05-15T10:00:00.000Z', '{"x":1}');
    expect(a).not.toBe(b);
  });

  describe('verifySyncRequest', () => {
    const now = Date.parse('2026-05-15T10:00:00.000Z');
    const body = '{"events":[{"id":"abc"}]}';
    const timestamp = '2026-05-15T10:00:00.000Z';
    const signature = signSyncRequest(SECRET, timestamp, body);

    it('accepts a valid signed request', () => {
      const r = verifySyncRequest({
        expectedShopId: SHOP,
        secret: SECRET,
        shopId: SHOP,
        timestamp,
        signature,
        body,
        now,
      });
      expect(r.ok).toBe(true);
    });

    it('rejects when headers are missing', () => {
      const r = verifySyncRequest({
        expectedShopId: SHOP,
        secret: SECRET,
        shopId: undefined,
        timestamp,
        signature,
        body,
        now,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('missing-headers');
    });

    it('rejects on shop id mismatch', () => {
      const r = verifySyncRequest({
        expectedShopId: SHOP,
        secret: SECRET,
        shopId: 'wrong-shop',
        timestamp,
        signature,
        body,
        now,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('shop-id-mismatch');
    });

    it('rejects a malformed timestamp', () => {
      const r = verifySyncRequest({
        expectedShopId: SHOP,
        secret: SECRET,
        shopId: SHOP,
        timestamp: 'not-a-date',
        signature,
        body,
        now,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('timestamp-malformed');
    });

    it('rejects a timestamp older than the skew window', () => {
      const r = verifySyncRequest({
        expectedShopId: SHOP,
        secret: SECRET,
        shopId: SHOP,
        timestamp,
        signature,
        body,
        now: now + 6 * 60 * 1000,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('timestamp-expired');
    });

    it('rejects a timestamp from the future beyond the skew window', () => {
      const r = verifySyncRequest({
        expectedShopId: SHOP,
        secret: SECRET,
        shopId: SHOP,
        timestamp,
        signature,
        body,
        now: now - 6 * 60 * 1000,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('timestamp-expired');
    });

    it('rejects on signature mismatch when body has been tampered with', () => {
      const r = verifySyncRequest({
        expectedShopId: SHOP,
        secret: SECRET,
        shopId: SHOP,
        timestamp,
        signature,
        body: '{"events":[{"id":"xyz"}]}',
        now,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('signature-mismatch');
    });

    it('rejects a wrong-length signature without throwing', () => {
      const r = verifySyncRequest({
        expectedShopId: SHOP,
        secret: SECRET,
        shopId: SHOP,
        timestamp,
        signature: 'deadbeef',
        body,
        now,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('signature-mismatch');
    });
  });
});
