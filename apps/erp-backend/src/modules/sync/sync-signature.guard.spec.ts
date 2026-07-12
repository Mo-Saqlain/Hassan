import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SyncSignatureGuard } from './sync-signature.guard';
import {
  signSyncRequest,
  SYNC_SHOP_ID_HEADER,
  SYNC_SIGNATURE_HEADER,
  SYNC_TIMESTAMP_HEADER,
} from './hmac.util';

const SECRET = 'a'.repeat(64);
const SHOP = 'hassan-main';

function makeContext(headers: Record<string, string>, body: unknown): ExecutionContext {
  const req = { headers, body };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('SyncSignatureGuard', () => {
  let guard: SyncSignatureGuard;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    guard = new SyncSignatureGuard();
    originalEnv = { ...process.env };
    process.env.SHOP_ID = SHOP;
    process.env.SHOP_SYNC_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts a correctly signed request', () => {
    const body = { events: [{ id: 'abc', type: 'SALE_CREATED', payload: {} }] };
    const ts = new Date().toISOString();
    const sig = signSyncRequest(SECRET, ts, JSON.stringify(body));
    const ctx = makeContext(
      {
        [SYNC_SHOP_ID_HEADER]: SHOP,
        [SYNC_TIMESTAMP_HEADER]: ts,
        [SYNC_SIGNATURE_HEADER]: sig,
      },
      body,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when env is not configured', () => {
    delete process.env.SHOP_ID;
    const ctx = makeContext({}, {});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects an unsigned request', () => {
    const ctx = makeContext({}, { events: [] });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a request whose signature was computed against a tampered body', () => {
    const sentBody = { events: [{ id: 'abc' }] };
    const ts = new Date().toISOString();
    const sigForOther = signSyncRequest(SECRET, ts, JSON.stringify({ events: [{ id: 'xyz' }] }));
    const ctx = makeContext(
      {
        [SYNC_SHOP_ID_HEADER]: SHOP,
        [SYNC_TIMESTAMP_HEADER]: ts,
        [SYNC_SIGNATURE_HEADER]: sigForOther,
      },
      sentBody,
    );
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects an expired timestamp', () => {
    const body = { events: [] };
    const ts = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const sig = signSyncRequest(SECRET, ts, JSON.stringify(body));
    const ctx = makeContext(
      {
        [SYNC_SHOP_ID_HEADER]: SHOP,
        [SYNC_TIMESTAMP_HEADER]: ts,
        [SYNC_SIGNATURE_HEADER]: sig,
      },
      body,
    );
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a request from an unknown shop id', () => {
    const body = { events: [] };
    const ts = new Date().toISOString();
    const sig = signSyncRequest(SECRET, ts, JSON.stringify(body));
    const ctx = makeContext(
      {
        [SYNC_SHOP_ID_HEADER]: 'some-other-shop',
        [SYNC_TIMESTAMP_HEADER]: ts,
        [SYNC_SIGNATURE_HEADER]: sig,
      },
      body,
    );
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
