import axios from 'axios';

// Resolve the API base URL from (in order):
// 1. Build-time env var REACT_APP_API_BASE_URL (use this for production builds)
// 2. The hostname the page was loaded from, on port 3001 (so visiting from a
//    phone at http://192.168.x.x:3000 talks to http://192.168.x.x:3001 instead
//    of the phone's own localhost).
const fallbackHost =
  typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const baseURL =
  process.env.REACT_APP_API_BASE_URL ?? `http://${fallbackHost}:3001/api`;

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

/** Resolved API base URL (host + /api). Used for native browser downloads
 *  that can't go through axios because we need the browser to handle the
 *  Content-Disposition header. */
export const apiBaseUrl = () => baseURL;

// ─────────────── Auth token plumbing ─────────────────────────────────
// `AuthContext` calls `setAuthToken(token)` after login/logout and on
// page boot so every subsequent request carries `Authorization: Bearer
// <token>`. Stored in a module-level closure so it's available the
// instant the very first request fires (including the auth-check on
// page load).
const TOKEN_KEY = 'hassan-auth-token';
let authToken = null;
try {
  authToken = localStorage.getItem(TOKEN_KEY);
} catch {
  /* SSR / private-mode fallback — token will be set by login() */
}

export function setAuthToken(token) {
  authToken = token || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore quota errors */
  }
}

api.interceptors.request.use((cfg) => {
  if (authToken) {
    cfg.headers = cfg.headers || {};
    cfg.headers.Authorization = `Bearer ${authToken}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg =
      err.response?.data?.message ?? err.message ?? 'Unknown error';
    err.uiMessage = Array.isArray(msg) ? msg.join(', ') : String(msg);
    // 401 = token rejected. Clear it so the next render kicks the user
    // back to the login screen — but avoid a redirect loop on the login
    // form itself.
    if (err.response?.status === 401 && authToken) {
      setAuthToken(null);
      try {
        localStorage.removeItem('hassan-auth-user');
      } catch {
        /* ignore */
      }
      if (typeof window !== 'undefined') {
        const path = window.location.hash || '';
        if (!path.includes('#/login')) {
          window.location.hash = '#/login';
        }
      }
    }
    return Promise.reject(err);
  },
);

// ─────────────── Tiny GET cache ────────────────────────────────────────
// In-memory cache + in-flight dedup for GETs. Designed so that bouncing
// between pages that ask for the same list (e.g. /accounts, /customers)
// doesn't re-pay the network round-trip every time. POST/PATCH/DELETE
// through `api` invalidate everything; callers can also force a fresh
// read with `getCached(path, { fresh: true })`.
const CACHE_TTL_MS = 10_000;
const cache = new Map(); // path -> { data, expiresAt }
const inflight = new Map(); // path -> Promise

export function getCached(path, { fresh = false, ttlMs = CACHE_TTL_MS } = {}) {
  const now = Date.now();
  if (!fresh) {
    const hit = cache.get(path);
    if (hit && hit.expiresAt > now) {
      return Promise.resolve({ data: hit.data, cached: true });
    }
  }
  const pending = inflight.get(path);
  if (pending) return pending;
  const req = api.get(path).then(
    (res) => {
      cache.set(path, { data: res.data, expiresAt: Date.now() + ttlMs });
      inflight.delete(path);
      return res;
    },
    (err) => {
      inflight.delete(path);
      throw err;
    },
  );
  inflight.set(path, req);
  return req;
}

export function invalidateCache(prefix) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

// Writes invalidate the whole cache by default — safest behaviour for a
// small ERP where a sale impacts customer balances, stock, cash book…
api.interceptors.request.use((cfg) => {
  if (cfg.method && cfg.method.toLowerCase() !== 'get') {
    invalidateCache();
  }
  return cfg;
});

export const endpoints = {
  brands: '/brands',
  items: '/items',
  customers: '/customers',
  suppliers: '/suppliers',
  stores: '/stores',
  stock: {
    summary: '/stock/summary',
    movements: '/stock/movements',
    adjust: '/stock/adjust',
  },
  sales: '/sales',
  purchases: '/purchases',
  sync: '/sync',
};
