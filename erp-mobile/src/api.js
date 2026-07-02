import { supabase } from './supabase';
import { startOfMonth, startOfToday } from './format';

// All queries are read-only. Aggregates (stock on-hand, balances, KPIs) come
// from the views created by supabase/setup.sql; history lists read the base
// tables directly (with PostgREST FK embedding for related rows).

export async function getKpis() {
  const { data, error } = await supabase.from('mobile_kpis').select('*').single();
  if (error) throw error;
  return data;
}

// Revenue for today + this month, summed client-side from active sales.
export async function getRevenueWindows() {
  const { data, error } = await supabase
    .from('sales')
    .select('net_amount, created_at')
    .is('reversed_at', null)
    .gte('created_at', startOfMonth());
  if (error) throw error;
  const today = startOfToday();
  let month = 0;
  let todayTotal = 0;
  for (const r of data || []) {
    const v = Number(r.net_amount || 0);
    month += v;
    if (r.created_at >= today) todayTotal += v;
  }
  return { today: todayTotal, month, todayCount: (data || []).filter((r) => r.created_at >= today).length };
}

export async function getSales({ limit = 50, search = '' } = {}) {
  let q = supabase
    .from('sales')
    .select(
      'id, invoice_no, created_at, net_amount, discount, paid_amount, due_amount, payment_method, reversed_at, ' +
        'customers(name, phone), ' +
        'sale_items(quantity, unit_price, line_total, items(name, sku))',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (search.trim()) q = q.ilike('invoice_no', `%${search.trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getPurchases({ limit = 50, search = '' } = {}) {
  let q = supabase
    .from('purchases')
    .select(
      'id, bill_no, created_at, net_amount, discount, paid_amount, due_amount, payment_method, reversed_at, ' +
        'suppliers(name, phone), ' +
        'purchase_items(quantity, unit_price, line_total, items(name, sku))',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (search.trim()) q = q.ilike('bill_no', `%${search.trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getStock({ search = '', lowOnly = false, limit = 200 } = {}) {
  let q = supabase
    .from('mobile_item_stock')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(limit);
  if (lowOnly) q = q.eq('low_stock', true);
  if (search.trim()) {
    const t = search.trim();
    q = q.or(`name.ilike.%${t}%,sku.ilike.%${t}%,barcode.ilike.%${t}%,model_no.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getCustomerBalances({ search = '', limit = 300 } = {}) {
  let q = supabase
    .from('mobile_customer_balance')
    .select('*')
    .order('balance', { ascending: false })
    .limit(limit);
  if (search.trim()) {
    const t = search.trim();
    q = q.or(`name.ilike.%${t}%,phone.ilike.%${t}%,code.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getSupplierBalances({ search = '', limit = 300 } = {}) {
  let q = supabase
    .from('mobile_supplier_balance')
    .select('*')
    .order('balance', { ascending: false })
    .limit(limit);
  if (search.trim()) {
    const t = search.trim();
    q = q.or(`name.ilike.%${t}%,phone.ilike.%${t}%,code.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
