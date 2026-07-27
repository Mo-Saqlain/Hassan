-- ============================================================================
-- Hassan Electronics ERP — Mobile (read-only) Supabase access setup
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor (logged in as the project owner /
-- postgres role). It:
--   1. Grants the `anon` role SELECT on the business tables the mobile app
--      reads directly (history lists), plus a read-only RLS policy per table so
--      those reads work under row-level security while writes stay blocked.
--      (Supabase enables RLS and grants anon broad privileges by default: a bare
--      grant reads back empty, and leaving RLS off would let the anon key WRITE.)
--      The mobile app authenticates with the public anon key only, read-only.
--   2. Creates aggregate VIEWS for figures that are NOT stored in any column
--      and must be computed: on-hand stock, customer A/R, supplier A/P, and a
--      one-row KPI summary. The formulas mirror the desktop ReportsService
--      exactly so the phone shows the same numbers as the desktop app.
--
-- Confidentiality is out of scope for this ERP (owner prioritises integrity +
-- availability), so exposing business tables to the anon role is acceptable.
-- We deliberately do NOT expose: users / auth tokens, settings, audit_logs,
-- error_logs, or the sync_queue / sync_events tables.
--
-- Re-running is safe: grants are idempotent and views use CREATE OR REPLACE.
--
-- PREREQUISITE: the cloud schema must already carry the columns the views read.
-- Schema on Postgres comes from TypeORM `synchronize` (DB_SYNC=true), not from
-- migration files, so a cloud DB that hasn't seen a backend boot since the last
-- entity change will be missing columns. Section 0 checks this and tells you.
-- ============================================================================

-- ── 0. Pre-flight: is the cloud schema current? ──────────────────────────────
-- This script (and the app) read columns that only exist once the backend has
-- booted against THIS database with DB_SYNC=true — TypeORM `synchronize` is what
-- creates them; there are no migration files. Running against a stale cloud copy
-- otherwise fails deep inside a view with a bare `column ... does not exist`,
-- which says nothing about the actual fix. Check every newer column the views +
-- the mobile screens depend on up front and report them all at once.
--
-- If this raises: point the backend at this database (local/secrets/erp-backend.env
-- has DATABASE_URL + DB_SYNC=true + DB_SSL=true), start it once, let it finish
-- booting, then re-run this script. Do NOT hand-write the columns — that puts the
-- cloud schema out of step with what `synchronize` expects on the next boot.
do $$
declare
  missing text[] := '{}';
  r record;
begin
  for r in
    select * from (values
      ('sale_returns',     'refund_amount'),
      ('sale_returns',     'refund_account_id'),
      ('sale_returns',     'disposition'),
      ('sale_returns',     'replacement_sale_id'),
      ('sale_returns',     'reason'),
      ('purchase_returns', 'disposition'),
      ('purchase_returns', 'reason'),
      ('sale_items',       'cost_at_sale_time'),
      ('items',            'reserved_qty'),
      ('items',            'avg_cost'),
      ('items',            'min_stock_level'),
      ('payments',         'direction'),
      ('payments',         'customer_id')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      missing := missing || format('%s.%s', r.tbl, r.col);
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception
      'Cloud schema is behind the backend entities — missing: %. Boot the NestJS backend against this database with DB_SYNC=true (TypeORM synchronize creates them), then re-run this script.',
      array_to_string(missing, ', ');
  end if;
end $$;

-- ── 1. Direct-read grants (history lists query these tables directly) ───────
grant usage on schema public to anon;

grant select on
  sales, sale_items,
  purchases, purchase_items,
  sale_returns, sale_return_items,
  purchase_returns, purchase_return_items,
  items, brands, categories, item_categories,
  customers, suppliers,
  stores
to anon;

-- ── 1b. RLS read-only policies (REQUIRED on RLS-enabled projects) ────────────
-- On a Supabase project with RLS enabled, the grant above is NOT enough: with
-- RLS on and no policy every row is filtered out, so the mobile History list and
-- dashboard revenue tiles come back empty. Add a SELECT-only policy per table so
-- anon can read, and deliberately add NO write policy so INSERT/UPDATE/DELETE
-- stay blocked (Supabase's defaults otherwise grant anon those privileges too —
-- enabling RLS here is what neutralises them). The backend connects as the
-- table-owning postgres role, which bypasses RLS, so it is unaffected.
do $$
declare t text;
begin
  foreach t in array array[
    'sales','sale_items','purchases','purchase_items',
    'sale_returns','sale_return_items','purchase_returns','purchase_return_items',
    'items','brands','categories','item_categories','customers','suppliers','stores'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists mobile_anon_read on %I', t);
    execute format('create policy mobile_anon_read on %I for select to anon using (true)', t);
  end loop;
end $$;

-- ── 2. On-hand stock view ───────────────────────────────────────────────────
-- On-hand is NEVER stored; it is the running sum of stock_movements
-- (IN => +qty, OUT => -qty). NOTE: items.costed_qty is only the weighted-avg
-- cost denominator (rolled up on purchase IN, adjusted on returns) and is NOT
-- the on-hand quantity — do not use it for stock levels.
create or replace view mobile_item_stock as
select
  i.id                                              as item_id,
  i.name,
  i.sku,
  i.barcode,
  i.model_no,
  b.name                                            as brand,
  i.unit,
  i.min_stock_level,
  i.reserved_qty,
  i.avg_cost,
  i.sale_price,
  i.is_active,
  coalesce(m.on_hand, 0)                            as on_hand,
  coalesce(m.on_hand, 0) - i.reserved_qty           as available,
  coalesce(m.on_hand, 0) * i.avg_cost               as inventory_value,
  (coalesce(m.on_hand, 0) <= i.min_stock_level)     as low_stock
from items i
left join brands b on b.id = i.brand_id
left join (
  select item_id,
         sum(case when type = 'IN' then quantity else -quantity end) as on_hand
  from stock_movements
  group by item_id
) m on m.item_id = i.id;

-- ── 3. Customer balances (A/R) ──────────────────────────────────────────────
-- Mirrors ReportsService.allCustomerBalances exactly:
--   balance = opening_balance
--           + SUM(sales.net_amount) - SUM(sales.paid_amount)
--           - SUM(sale_returns.store_credit)          -- total − cash refunded
--           - SUM(payments IN.amount)                 -- receipts
--           + SUM(payments OUT.amount)                -- loans/advances to customer
-- store_credit nets out any cash refunded on a return (that cash left via the
-- till/cash book, so it must NOT also reduce A/R). loan-OUT payments increase
-- what the customer owes. (No reversed_at filter — matches the desktop report.)
create or replace view mobile_customer_balance as
select
  c.id                                              as customer_id,
  c.code,
  c.name,
  c.phone,
  c.is_active,
  c.opening_balance,
  c.opening_balance
    + coalesce(s.net, 0)  - coalesce(s.paid, 0)
    - coalesce(r.store_credit, 0)
    - coalesce(p.paid_in, 0)
    + coalesce(p.paid_out, 0)                        as balance
from customers c
left join (
  select customer_id,
         sum(net_amount)  as net,
         sum(paid_amount) as paid
  from sales where customer_id is not null
  group by customer_id
) s on s.customer_id = c.id
left join (
  -- store-credit portion only: total returned − cash refunded
  select customer_id,
         sum(total_amount) - sum(coalesce(refund_amount, 0)) as store_credit
  from sale_returns where customer_id is not null
  group by customer_id
) r on r.customer_id = c.id
left join (
  select customer_id,
         sum(amount) filter (where direction = 'IN')  as paid_in,
         sum(amount) filter (where direction = 'OUT') as paid_out
  from payments
  where customer_id is not null
  group by customer_id
) p on p.customer_id = c.id;

-- ── 4. Supplier balances (A/P) ───────────────────────────────────────────────
-- Mirrors ReportsService.allSupplierBalances exactly:
--   balance = opening_balance
--           + SUM(purchases.net_amount) - SUM(purchases.paid_amount)
--           - SUM(purchase_returns.total_amount)
--           - SUM(payments OUT.amount)
create or replace view mobile_supplier_balance as
select
  su.id                                             as supplier_id,
  su.code,
  su.name,
  su.phone,
  su.is_active,
  su.opening_balance,
  su.opening_balance
    + coalesce(p.net, 0)  - coalesce(p.paid, 0)
    - coalesce(r.total, 0)
    - coalesce(pm.paid_out, 0)                       as balance
from suppliers su
left join (
  select supplier_id,
         sum(net_amount)  as net,
         sum(paid_amount) as paid
  from purchases where supplier_id is not null
  group by supplier_id
) p on p.supplier_id = su.id
left join (
  select supplier_id, sum(total_amount) as total
  from purchase_returns where supplier_id is not null
  group by supplier_id
) r on r.supplier_id = su.id
left join (
  select supplier_id, sum(amount) as paid_out
  from payments
  where direction = 'OUT' and supplier_id is not null
  group by supplier_id
) pm on pm.supplier_id = su.id;

-- ── 5. One-row KPI summary for the dashboard ─────────────────────────────────
create or replace view mobile_kpis as
select
  (select coalesce(sum(net_amount), 0) from sales   where reversed_at is null)      as total_revenue,
  (select coalesce(sum(si.cost_at_sale_time * si.quantity), 0)
     from sale_items si join sales s on s.id = si.sale_id
     where s.reversed_at is null)                                                   as total_cogs,
  (select count(*)  from sales     where reversed_at is null)                       as sales_count,
  (select count(*)  from purchases where reversed_at is null)                       as purchases_count,
  (select coalesce(sum(inventory_value), 0) from mobile_item_stock)                 as inventory_value,
  (select count(*)  from mobile_item_stock where is_active = true)                  as active_items,
  (select count(*)  from mobile_item_stock where low_stock = true and is_active = true) as low_stock_items,
  (select coalesce(sum(balance), 0) from mobile_customer_balance where balance > 0) as ar_total,
  (select coalesce(sum(balance), 0) from mobile_supplier_balance where balance > 0) as ap_total;

-- ── 5b. Per-product sales (units / revenue / COGS / profit) ──────────────────
-- Mirrors ReportsService.product-sales: aggregated over NON-reversed sales,
-- COGS from the snapshotted cost_at_sale_time. Items with no sales show zeros.
create or replace view mobile_product_sales as
select
  i.id                                              as item_id,
  i.name,
  i.sku,
  b.name                                            as brand,
  coalesce(ps.units, 0)                             as units_sold,
  coalesce(ps.revenue, 0)                           as revenue,
  coalesce(ps.cogs, 0)                              as cogs,
  coalesce(ps.revenue, 0) - coalesce(ps.cogs, 0)    as profit
from items i
left join brands b on b.id = i.brand_id
left join (
  select si.item_id,
         sum(si.quantity)                          as units,
         sum(si.line_total)                        as revenue,
         sum(si.cost_at_sale_time * si.quantity)   as cogs
  from sale_items si
  join sales s on s.id = si.sale_id
  where s.reversed_at is null
  group by si.item_id
) ps on ps.item_id = i.id;

-- ── 6. Grant read on the views ───────────────────────────────────────────────
grant select on
  mobile_item_stock,
  mobile_customer_balance,
  mobile_supplier_balance,
  mobile_product_sales,
  mobile_kpis
to anon;

-- Done. PostgREST reloads its schema cache automatically after DDL on Supabase.
