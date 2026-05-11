import axios from 'axios';

const baseURL =
  process.env.REACT_APP_API_BASE_URL ?? 'http://localhost:3001/api';

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
