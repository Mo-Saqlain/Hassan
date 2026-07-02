-- ============================================================================
-- Hassan Electronics ERP — Mobile (read-only) Supabase access setup
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor (logged in as the project owner /
-- postgres role). It:
--   1. Grants the `anon` role SELECT on the business tables the mobile app
--      reads directly (history lists). The mobile app authenticates with the
--      public anon key only, and is strictly read-only.
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
-- ============================================================================

-- ── 1. Direct-read grants (history lists query these tables directly) ───────
grant usage on schema public to anon;

grant select on
  sales, sale_items,
  purchases, purchase_items,
  items, brands, categories, item_categories,
  customers, suppliers,
  stores
to anon;

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
--           - SUM(sale_returns.total_amount)
--           - SUM(payments IN.amount)
-- (No reversed_at filter — matches the desktop report so numbers agree.)
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
    - coalesce(r.total, 0)
    - coalesce(p.paid_in, 0)                        as balance
from customers c
left join (
  select customer_id,
         sum(net_amount)  as net,
         sum(paid_amount) as paid
  from sales where customer_id is not null
  group by customer_id
) s on s.customer_id = c.id
left join (
  select customer_id, sum(total_amount) as total
  from sale_returns where customer_id is not null
  group by customer_id
) r on r.customer_id = c.id
left join (
  select customer_id, sum(amount) as paid_in
  from payments
  where direction = 'IN' and customer_id is not null
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

-- ── 6. Grant read on the views ───────────────────────────────────────────────
grant select on
  mobile_item_stock,
  mobile_customer_balance,
  mobile_supplier_balance,
  mobile_kpis
to anon;

-- Done. PostgREST reloads its schema cache automatically after DDL on Supabase.
