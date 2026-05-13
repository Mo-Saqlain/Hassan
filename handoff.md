# Handoff — 2026-05-13 (sessions 6–9 rolled up)

## Session summary
This is a roll-up of everything since the last commit (a few smaller sessions worked on the hub UX, performance, salary accrual, audit/error logs, and an inline-item creator in Purchases). All four are wired end-to-end and verified by tests + build.

## Big-ticket changes

### Hub-based navigation (replaces collapsible sidebar sections)
- Sidebar is now a flat list — one entry per domain — and each domain's sub-pages are reached via a horizontal **tab strip** at the top of the page.
- New files: [erp-frontend/src/components/HubFrame.js](erp-frontend/src/components/HubFrame.js), [erp-frontend/src/nav/hubs.js](erp-frontend/src/nav/hubs.js).
- Sidebar order is operational hubs first, then Reports, then System (admin/utility) at the bottom. See [erp-frontend/src/nav/hubs.js](erp-frontend/src/nav/hubs.js) for the single source of truth.
- Tab labels are short (Info / Receipts / Ledger, etc.) because the hub title above already says which domain you're in.
- Sub-page page-headers are CSS-suppressed inside the hub frame so you never see "Customers" stacked on top of "Customers" — action buttons in those headers stay visible and right-align.

### Backend performance (parallel reads + GROUP BY rollups)
- Every hot endpoint was awaiting reads serially → over the Supabase pooler that was ~14 round-trips × 200 ms = ~4 s for the Cash Book. Rewrote `dailyBook`, `cashOnHandAsOf`, `balanceSheet`, `incomeStatement`, `cashFlow`, `equityChanges`, `cashAndBankAt`, all four ledgers, and `computeForPeriod` (employee incentives) to fan out via `Promise.all`. Inventory at-cost is now one `GROUP BY item_id` instead of one query per item.
- Frontend GET cache + in-flight dedup added in [erp-frontend/src/api/client.js](erp-frontend/src/api/client.js); 10 s TTL, invalidates on any non-GET. [erp-frontend/src/hooks/useResource.js](erp-frontend/src/hooks/useResource.js) uses it.

### Monthly salary accrual
- Each employee gets a `salaryDay` (1–31) and `firstSalaryInAdvance` flag. New cron at [erp-backend/src/modules/employees/salary-accrual.service.ts](erp-backend/src/modules/employees/salary-accrual.service.ts) ticks hourly and posts a `SALARY_ACCRUED` row (debit) to the employee ledger on the configured day, idempotent per (employee, calendar month).
- New transaction type `SALARY_ACCRUED` added to the entity / DTO / voucher prefix map.
- `employeeLedger` and `allEmployeeBalances` updated to treat `SALARY_ACCRUED` as a debit instead of a credit.
- Manual catch-up endpoints: `POST /employees/accrue-salaries` (all due) and `POST /employees/:id/accrue-salary`. The Employees panel has a **Run salary accrual** button at the top.

### Audit log + Error log (System tab)
- New backend modules: [erp-backend/src/modules/audit-logs/](erp-backend/src/modules/audit-logs/) and [erp-backend/src/modules/error-logs/](erp-backend/src/modules/error-logs/).
- The TypeORM subscriber in `audit.subscriber.ts` is registered on the global data source via `OnModuleInit`; it listens to all entity inserts/updates/deletes, filters out internal tables (audit, error, outbox), and writes a human-readable summary plus a JSON snapshot to `audit_logs`.
- The global Nest exception filter in `error-log.filter.ts` preserves Nest's default response shape but writes every error to `error_logs` with method/path/status/message/stack/context. Installed in [erp-backend/src/main.ts](erp-backend/src/main.ts).
- Both have read + clear endpoints (`GET /audit-logs`, `DELETE /audit-logs`; same for `/error-logs`) and frontend pages with filters, expandable detail, and CSV/PDF export via the existing `<ExportButtons />`.
- Pages: [erp-frontend/src/pages/AuditLog.js](erp-frontend/src/pages/AuditLog.js) and [erp-frontend/src/pages/ErrorLog.js](erp-frontend/src/pages/ErrorLog.js). Wired under the System hub: Backups · Audit · Errors.

### Bill-vs-payment clean-up
- Purchases listing dropped the misleading per-bill **Paid / Due** columns. The remaining column is renamed **Paid at bill** to make it clear it only tracks the at-entry amount. An info chip points users to the **Payments** tab + **Supplier Ledger** for net balance.
- Sales got the same treatment for symmetry.
- [erp-frontend/src/components/VoucherPage.js](erp-frontend/src/components/VoucherPage.js) (Receipts + Payments form) now sources its party picker from `/reports/{customer,supplier}-balances` so each party shows their running balance ("we owe 400,000") in the dropdown and a hint line under the picker.

### Inline item creator in Purchases
- Every Purchase-line item picker has a `+ New` button. Click → modal with Model No, Name, Brand, SKU, Barcode, Purchase + Sale price. Saves to `/items`, prepends to the dropdown, auto-selects on the originating line, and prefills that line's unit price.
- Code: [erp-frontend/src/pages/Purchases.js](erp-frontend/src/pages/Purchases.js).

### Smaller fixes
- Earlier session shipped a CSS rule that was hiding the entire `.page-head` row inside hubs, which collapsed the "+ New …" buttons on Stock Transfers, Damaged Goods, Purchase Orders, Employee Payments, and Employee Incentive Rules. Fixed: only the `.page-title` child gets hidden, the row stays visible and right-aligned.
- Added `salaryDay` (1–31) + `firstSalaryInAdvance` to the Employee form in [erp-frontend/src/pages/MasterData.js](erp-frontend/src/pages/MasterData.js).

## How to verify
- `cd erp-backend && npm test` — 77/77 passing.
- `cd erp-frontend && npm run build` — compiles clean.
- Manual smoke test:
  1. Sidebar order: ends in `… Account → Reports → System`.
  2. System → **Audit** shows entries for every recent insert/update/delete. CSV + PDF export buttons at top-right.
  3. System → **Errors**. Trigger a 400 (e.g. send a bad POST) — it appears here within a second.
  4. Purchase → Bills → New Purchase. On any line, click `+ New`. Fill Model No + Purchase price. Save → that line's item is set to the new item and the unit price is prefilled.
  5. Employee → Info → edit an employee. Salary day = today's day of month. Save. Click **Run salary accrual** at the top → see "Accrued salary for 1 employee(s)" (or "No salaries due …" if first-in-advance is off and they joined this month). Employee → Ledger shows the new SALARY_ACCRUED row as a debit and the closing balance now reads "we owe".
  6. Cash Book on an empty day should load well under a second.

## Follow-ups / known issues
- The error log captures everything, including 400 validation errors (tagged WARN). If the noise gets in the way, add a `WARN`-suppression filter on the page or back-end.
- The audit log lives in the same DB as the data it audits, so dropping the database wipes the audit trail. If long-term retention matters, ship audit rows to a separate file or store.
- Salary pro-ration isn't supported — `firstSalaryInAdvance` employees joining mid-month still get the full month's amount.
- `balanceSheet` A/R / A/P still call the per-party ledger function under `Promise.all`. With 1000+ customers that will saturate the connection pool — fix is a batched `asOf`-aware variant. Out of scope here.
