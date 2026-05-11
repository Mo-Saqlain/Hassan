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

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg =
      err.response?.data?.message ?? err.message ?? 'Unknown error';
    err.uiMessage = Array.isArray(msg) ? msg.join(', ') : String(msg);
    return Promise.reject(err);
  },
);

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
