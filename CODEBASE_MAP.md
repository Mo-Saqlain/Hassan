# Codebase Map — Hassan Electronics ERP

> **What this is:** a module-and-key-files index so the codebase doesn't have to be re-read from scratch each session. For architecture, conventions, run instructions, and the domain model, read [CLAUDE.md](CLAUDE.md) and [README.md](README.md) first — this file is the "where does X live" companion to them.
>
> **Freshness:** generated against commit `65b8920` on 2026-06-11. A `SessionStart` hook checks whether any source file changed since this file was last written and reminds Claude to regenerate it. To refresh manually, just say "refresh the codebase map". When you regenerate, update the commit/date stamp above.

---

## Layout

```
erp-backend/    NestJS 11 + TypeORM 0.3 — 36 domain modules under src/modules/, one folder per module
                (entities/, dto/, <name>.service.ts, <name>.controller.ts, <name>.module.ts).
                src/main.ts (bootstrap + global ValidationPipe), src/app.module.ts (DB config + module wiring),
                src/seed.ts (stress-test seeder), src/data-source.ts (TypeORM CLI), src/common/ (BaseEntity,
                sqlite-checkpoint), src/testing/test-db.ts (in-memory SQLite for specs).
erp-frontend/   React 19 + HashRouter + axios. src/pages/, src/components/, src/hooks/, src/api/client.js,
                src/nav/hubs.js, src/theme/.
erp-desktop/    Electron 40 wrapper. src/main.js, src/preload.js.
scripts/        make-icons.ps1.
```

Cross-cutting conventions (don't re-derive — see CLAUDE.md): global `AuthGuard` (opaque bearer tokens, `@Public()` exempts); snake_case DB columns via `name:`; `@Column({ type: Date })` not `'timestamp'`/`'datetime'`; voucher numbers via `SequenceService` (`PREFIX-000123`); audit via `AuditSubscriber`; double-entry journals posted inside each service's transaction.

---

# Backend modules

## Platform / cross-cutting

### users
- **Purpose:** Authentication, authorization, and user-account lifecycle.
- **Entities:** `User` (`users`) — username, scrypt `passwordHash`, role SUPERUSER|USER, sliding `sessionToken`; `UserAccessRequest` (`user_access_requests`) — PENDING/APPROVED/REJECTED signup requests; `UserLoginEvent` (`user_login_events`) — login audit feed.
- **Service:** `onModuleInit()` seeds admin/`Tech@123` (idempotent); `login()` verify + issue 12h sliding token + log event; `resolveSession()` validate + slide; `changeOwnPassword()`; superuser-only `createUser/updateUser/removeUser` (guard last superuser); access-request approve/reject; login-event viewer helpers.
- **Controller:** Public: `POST /auth/login`, `POST /auth/request-access`. Auth'd: `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`, `POST /auth/reauthenticate` (one-shot 60s token for restore). Superuser: `GET/POST /users`, `PATCH/DELETE /users/:id`, `/users/access-requests*`, `/users/login-events*`.
- **Notable:** `AuthGuard` is global (registered here as `APP_GUARD`); `@Public()` and `@SuperuserOnly()` decorators live in `auth.decorators.ts`. Passwords `scrypt:salt:hash`. Reauth token gates backup restore.

### sequences
- **Purpose:** Atomic monotonic voucher-number allocation (race-safe).
- **Entities:** `Sequence` (`sequences`) — `prefix` PK, `nextValue`.
- **Service:** `next(prefix, seedFromMax?)` — transactional allocate, pessimistic lock on Postgres / single-writer on SQLite, seeds from MAX if missing, returns `PREFIX-000123`.
- **Notable:** Global module, no controller. Single source for INV/BILL/SR/PR/RCT/PMT/TRF/PO/SVC/EMP/CUST/SUPP numbers. Count-based → not gap-free.

### journals
- **Purpose:** Double-entry posting engine; balanced entries + period locks.
- **Entities:** `JournalEntry` (`journal_entries`) — number, date, `sourceModule`, `sourceRef`, `reversesJournalEntryId`; `JournalLine` (`journal_lines`) — one positive Dr or Cr side.
- **Service:** `post(input, manager?)` validates balance (Dr=Cr ±0.005), period open, non-control accounts, persists atomically; `reverse(entryId, …)` idempotent flip; `findBySource(module, ref)`.
- **Controller:** read-only `GET /journals?from=&to=&limit=`, `GET /journals/:id`. Postings happen inside other services' transactions, never via HTTP.
- **Notable:** HARD_CLOSED periods reject; SOFT_CLOSED allow with warning. Control accounts never receive postings.

### periods
- **Purpose:** Govern journal writes by date range (OPEN/SOFT_CLOSED/HARD_CLOSED).
- **Entities:** `AccountingPeriod` (`accounting_periods`) — range + status + close audit.
- **Service:** `create` (no overlaps), `softClose/hardClose/reopen`, `assertOpen(date)` (throws on HARD_CLOSED), `findCovering(date)`.
- **Controller:** `GET/POST /periods`, `POST /periods/:id/{soft-close,hard-close,reopen}`.
- **Notable:** Undefined date ⇒ OPEN by default (books not yet being closed).

### outbox
- **Purpose:** Local event queue for manual cloud push (no background cron).
- **Entities:** `SyncQueueEntry` (`sync_queue`) — type, JSON payload, PENDING/SYNCED/FAILED, attempts, error.
- **Service:** `enqueue/list/countPending/countFailed/pending/failed/retry/save`.
- **Notable:** Only thing sales/purchases/POS and the sync pusher share — do **not** make those import `SyncModule` (circular). No controller.

### sync
- **Purpose:** Bi-directional cloud sync, HMAC-SHA256 signed.
- **Entities:** `SyncEvent` (`sync_events`) — client UUID PK = idempotency key, PROCESSED/FAILED/DUPLICATE.
- **Service:** inbound `push()` (dedupe; handles SALE_CREATED / POS_SALE_CREATED / PURCHASE_CREATED / POS_SESSION_* audit-only); outbound `pushPending()` (signs pending outbox, POSTs to `CLOUD_SYNC_URL`, returns `SyncRunSummary`); failed/retry helpers.
- **Controller:** `POST /sync/push` (`@Public` + `SyncSignatureGuard`), `GET /sync/{events,queue,status,failed}`, `POST /sync/failed/:id/retry`, `POST /sync/flush` (manual push).
- **Notable:** **Manual flush only** — no `@Cron`. Needs `CLOUD_SYNC_URL` + `SHOP_ID` + `SHOP_SYNC_SECRET`.

### audit-logs
- **Purpose:** Entity-mutation log via TypeORM `EntitySubscriber` (all INSERT/UPDATE/DELETE).
- **Entities:** `AuditLog` (`audit_logs`) — entityType, entityId, action, human `summary`, JSON `changes`, source.
- **Service:** `record()` **fire-and-forget** (never blocks the originating op); `findAll()` filtered, cap 5000.
- **Notable:** `AuditSubscriber` self-registers on boot. SKIP set: AuditLog/ErrorLog/OutboxEvent + User\*. ⚠️ The un-awaited `record()` interleaves with `dataSource.transaction()` under tight loops (see `seed.ts`, which detaches the subscriber to avoid poisoning transactions).

### error-logs
- **Purpose:** Central error capture from the global exception filter + cron logging.
- **Entities:** `ErrorLog` (`error_logs`) — level, source, method/path/statusCode, message, stack, context.
- **Controller:** superuser `GET /error-logs?…`, `DELETE /error-logs`.

### backup
- **Purpose:** Full-DB JSON snapshot + restore with SHA-256 verify and pre-restore safety snapshot.
- **Entities:** `Backup` (`backups`) — fileName, path, size, format, trigger AUTO/MANUAL, sha256, verifiedAt.
- **Service:** `dumpAll()` (walks all entities + M2M join tables), `createBackup`, `streamSnapshot`, `verify`, scheduled-hour getters, `runScheduledIfDue()` (daily cron), `restoreFromSnapshot()` (destructive; `confirm='RESTORE'` + reauth; FK toggle; pre-restore AUTO backup).
- **Controller:** `POST/GET /backup`, `GET /backup/{download-now,status,schedule}`, `POST /backup/schedule`, `POST /backup/:id/verify`, `GET /backup/:id/download`, `POST /backup/restore`.
- **Notable:** EXCLUDED_TABLES = backups + all user tables (re-seeded on boot; prevents superuser injection).

## Master data

### items
- **Purpose:** Product catalog — SKU/barcode, categories (M2M), pricing, costing, serial + warranty config.
- **Entities:** `Item` (`items`). Warranty: `hasWarranty`, `warrantyType` (COMPANY|SHOP|CHECKING_ONLY|NONE), `warrantyDays`. Serials: `tracksSerials`, `serialRequiredOnSale`, `isInternalGenerated`. Costing: `purchasePrice` (UI default only), `avgCost`, `costedQty`, `reservedQty`.
- **Service:** `create()` auto-derives SKU from modelNo (collision → -2/-3); `search()` fuzzy; `findByCode()` POS exact (barcode→sku→modelNo); uniqueness checks on SKU/barcode; `resolveCategories()` M2M.
- **Controller:** `POST/GET /items`, `GET /items/lookup?code=`, `GET /items/search?q=&limit=`, `GET/PATCH/DELETE /items/:id`.
- **Notable:** `avgCost`+`costedQty` are the costing source of truth, **never** `purchasePrice` for accounting. `item_categories` join table.

### brands · categories · customers · suppliers · stores · employees
- **brands** — `Brand` (`brands`): plain CRUD; Item has optional `brandId`.
- **categories** — `Category` (`categories`): self-referencing tree (`parentId`); `tree()` endpoint; cycle + self-parent guards; optional uppercase `code` (≤8) used in `LOCAL-<code>-<year>-<seq>` serials; app-layer code uniqueness.
- **customers** — `Customer` (`customers`): `onModuleInit` backfills `CUST-…` codes; `creditLimit` + `creditEnabled` gate credit/partial sales; `openingBalance`.
- **suppliers** — `Supplier` (`suppliers`): mirror of customers, `SUPP-…` codes.
- **stores** — `Store` (`stores`): name + location, no codes.
- **employees** — `Employee` (`employees`): `EMP-…` codes, `monthlySalary`, `salaryDay`, `firstSalaryInAdvance`. A `SalaryAccrualService` cron accrues SALARY_ACCRUED monthly (idempotent); manual triggers `POST /employees/accrue-salary[ies]`.
- All: standard `POST/GET/:id PATCH/DELETE`, `remove()` via `deleteOrConflict` guard.

## Inventory

### stock
- **Purpose:** Append-only on-hand ledger; OUT cannot go negative.
- **Entities:** `StockMovement` (`stock_movements`) — IN/OUT, qty, referenceType PURCHASE/SALE/RETURN/ADJUSTMENT/TRANSFER/DAMAGE, referenceId.
- **Service:** `recordMovement(input, manager?)` (transaction-safe, validates OUT ≥ on-hand), `adjust()`, `getOnHand(itemId, storeId?)`, `listMovements()` (last 500), `stockSummary()` (on-hand + min-stock + reserved + avgCost per item).
- **Controller:** `POST /stock/adjust`, `GET /stock/{movements,on-hand,summary}`.

### item-serials
- **Purpose:** Per-unit lifecycle + warranty + public lookup.
- **Entities:** `ItemSerial` (`item_serials`) — `serial` unique; two orthogonal axes: `status` (IN_STOCK/SOLD/RETURNED/DAMAGED/WRITE_OFF) and `allocationStatus` (AVAILABLE/BOOKED/DELIVERED); frozen warranty (type/days/start/end); `isInternalGenerated`.
- **Service:** `registerStock()` (idempotent intake), `bindToSale()` (SOLD + warranty freeze), `reserveForBooking()` (BOOKED when dueAmount>0), `markDelivered()`, `markReturned()`, `unbindFromInvoice()` (reversal), `generateLocalSerials()`, `listAvailableForItem()`, `lookupWarranty()` (public, no PII).
- **Controller:** `GET /item-serials?…`, `GET /item-serials/available`, `POST /item-serials`, `POST /item-serials/generate-local`, `GET /item-serials/warranty/:serial` (`@Public`).
- **Notable:** Don't collapse `status` + `allocationStatus`. Warranty frozen at sale time.

### stock-transfers
- **Entities:** `StockTransfer` (`stock_transfers`) + `StockTransferItem` (`stock_transfer_items`).
- **Service:** `create()` paired OUT@source + IN@dest in one transaction (rejects from==to, all-or-nothing). Immutable after create.
- **Controller:** `POST /stock-transfers`, `GET /stock-transfers?fromStoreId=&toStoreId=`, `GET /:id`.

### damaged-goods
- **Entities:** `DamagedGood` (`damaged_goods`) — status DAMAGED/IN_REPAIR/WRITE_OFF (+REPAIRED via update), reportedOn/resolvedOn.
- **Service:** `create()` books stock OUT; `updateStatus()` flips status (REPAIRED books IN again); delete blocked while out-of-stock; `tally()`.
- **Controller:** `POST /damaged-goods`, `GET /damaged-goods?status=`, `GET /damaged-goods/tally`, `GET/:id`, `PATCH /:id/status`, `DELETE /:id`.

## Sales side

### sales
- **Purpose:** Customer sales header+lines; deferred-cash schedule; warranty snapshot; reversal.
- **Entities:** `Sale` (`sales`) — invoiceNo, customer, totals, `paymentCommitments` JSON, `amountPaidSettled`, `dueAmount`, reversal meta; `SaleItem` (`sale_items`) — qty/price, `costAtSaleTime` (COGS snapshot), line-level warranty snapshot (type/days/start/end).
- **Service:** `create()` / private `createInTransaction()` — build lines, roll `costedQty`, stamp line warranty, stock OUT, credit-limit gate, post journal (Dr Cash/A_R/Deferred, Cr Revenue, Dr COGS, Cr Inventory); `createFromVoucher()` — sale + N receipt splits + serial binding branched on `dueAmount`; `reverse()`; `settleCommitment()`; `upcomingDeferred()`; `overdueBookings()`; `releaseBooking()`; warranty lookups `warrantyByInvoice/ByCustomer/ByModel`.
- **Controller:** `POST /sales`, `POST /sales/voucher`, `GET /sales`, `GET /sales/deferred/upcoming`, `GET /sales/overdue-bookings`, `GET /sales/warranty/{by-invoice/:invoiceNo,by-customer/:customerId,by-model}` (declared above `:id`), `GET /sales/:id`, `POST /sales/:id/{reverse,settle-commitment,release-booking}`.
- **Notable:** Page is read-only history (no "+ New Sale" form — POS/voucher driven). Booking serials reserve inventory until paid.

### pos
- **Purpose:** Cashier session + cart + checkout.
- **Entities:** `PosSession` (`pos_sessions`) — running totals, ACTIVE/CLOSED; `PosCartItem` (`pos_cart_items`) — session-scoped, stacks by itemId.
- **Service:** `startSession/closeSession/getActiveSession`, cart CRUD (`addToCart` stacks), `checkout()` validates serial requirements then calls `SalesService.createFromVoucher` (skipOutbox) + enqueues `POS_SALE_CREATED`.
- **Controller:** `POST /pos/sessions`, `GET /pos/sessions[/active|/:id]`, `POST /pos/sessions/:id/close`, `GET /pos/lookup?code=`, cart routes under `/pos/sessions/:id/cart` + `/pos/cart/:id`, `POST /pos/sessions/:id/checkout`.

### returns
- **Entities:** `SaleReturn`+`SaleReturnItem`, `PurchaseReturn`+`PurchaseReturnItem`.
- **Service:** `createSaleReturn()` → stock IN + restore costedQty + best-effort serial RETURNED; `createPurchaseReturn()` → stock OUT.
- **Controller:** `POST/GET /sale-returns[/:id]`, `POST/GET /purchase-returns[/:id]`.

### deliveries
- **Entities:** `Delivery` (`deliveries`) — 6 statuses; auto-fills from linked sale.
- **Service:** `create()` writes `Item.reservedQty` overlay for reserving statuses; `update()` enforces **Strict Handover** (block DELIVERED while `sale.dueAmount > 0`); `tally()`.
- **Controller:** `GET /deliveries`, `GET /deliveries/tally`, `POST /deliveries`, `GET/PATCH/DELETE /deliveries/:id`.
- **Notable:** Gate DELIVERED **only** on `dueAmount`.

### service-tickets
- **Entities:** `ServiceTicket` (`service_tickets`) — soft links `itemSerialId` **and** `saleItemId` (model-only path), `inWarranty` snapshot, 7 statuses.
- **Service:** `create()` (auto ticketNo), `update()` (auto-stamp deliveredAt on DELIVERED), `tally()`.
- **Controller:** `GET /service-tickets`, `GET /service-tickets/tally`, `POST`, `GET/PATCH/DELETE /:id`.

## Purchasing

### purchases
- **Entities:** `Purchase` (`purchases`) + `PurchaseItem` (`purchase_items`, per-line store, optional serials).
- **Service:** `create()` — weighted-average cost roll-up `(oldQty·oldAvg + inQty·price)/newQty`, stock IN per line, optional serial register, journal Dr Inventory / Cr Cash|Bank|A_P; `reverse()`.
- **Controller:** `POST/GET /purchases`, `GET /purchases/:id`, `POST /purchases/:id/reverse`.

### purchase-orders
- **Entities:** `PurchaseOrder` (`purchase_orders`) + `PurchaseOrderItem` — DRAFT/SENT/RECEIVED/CANCELLED, `expectedUnitCost` (forecast only).
- **Service:** `create`, `updateStatus`, CRUD. **No inventory effect** (procurement tracking only; no link back to Purchase).
- **Controller:** `POST/GET /purchase-orders`, `GET/:id`, `PATCH /:id/status`, `DELETE /:id`.

## Money

### accounts
- **Purpose:** Chart of accounts for double-entry.
- **Entities:** `Account` (`accounts`) — type/category hierarchy; control accounts (group leaves, not postable); system accounts REVENUE 4100 / COGS 5100 / INVENTORY 1150 / A_R 1140 / DEFERRED_RECEIVABLE 1145 / A_P 2100 / CASH_ON_HAND 1110.
- **Service:** CRUD + `findSystem(type)`; `onModuleInit` seeds control hierarchy + 7 system accounts idempotently; backfills codes/categories.
- **Controller:** `POST/GET /accounts`, `GET/PATCH/DELETE /accounts/:id` (system accounts can't be deleted).
- **Notable:** User-creatable types: CASH/BANK/WALLET/CAPITAL/CREDIT.

### payments
- **Entities:** `Payment` (`payments`) — `direction` IN (RCT-…) / OUT (PMT-…), account, customer|supplier, amount.
- **Service:** `create()` posts voucher + balancing journal; `reverse()` idempotent.
- **Controller:** `POST /payments`, `GET /payments?direction=`, `GET /:id`, `POST /:id/reverse`.
- **Notable:** IN requires customerId, OUT requires supplierId.

### fund-transfers
- **Entities:** `FundTransfer` (`fund_transfers`) — between own accounts, no stock impact.
- **Service:** `create()` symmetrical journal (Dr dest / Cr source), `reverse()`, plus `accountDeltaAt/groupDeltaAt/deltaByAccount/findInvolvingAccounts` (used by reports to exclude treasury moves from cash-flow).
- **Controller:** `POST/GET /fund-transfers`, `GET/DELETE /:id`, `POST /:id/reverse`.

### cash-register
- **Entities:** `CashEntry` (`cash_entries`) — misc cash movements; `CashRegisterSession` (`cash_register_sessions`) — per-day open/close, denomination map, variance.
- **Service:** entry CRUD; `openSession` (expected from prior day, optional shortfall transfer), `closeSession` (denominations + variance), `sessionStatus`, `varianceTrend`, `dailyBook(date)` (fans out session + entries + cash-account sales/purchases/payments + transfers).
- **Controller:** `POST/GET /cash-register`, `GET /cash-register/{day,summary,sessions,sessions/status,variance-trend}`, `POST /cash-register/sessions/{open,:date/close}`, `GET/DELETE /:id`.

## HR & incentives

### attendance
- **Entities:** `Attendance` (`attendance`) — unique (employeeId, date), status PRESENT/ABSENT/HALF_DAY/LEAVE.
- **Service:** `upsert()` by key, `findAll`, `grid(from,to)` (matrix), `tally()`.
- **Controller:** `POST /attendance`, `GET /attendance[?…]`, `GET /attendance/{grid,tally}`, `DELETE /:id`.

### employee-transactions
- **Entities:** `EmployeeTransaction` (`employee_transactions`) — type SALARY_ACCRUED/SALARY/ADVANCE/REIMBURSEMENT/EXPENSE/INCENTIVE_PAYOUT/ADJUSTMENT, optional `accountId`.
- **Service:** `create()` auto voucherNo per type; list/findOne/remove.
- **Notable:** Ledger semantics: SALARY_ACCRUED = Dr (we owe); payouts = Cr.

### employee-incentives
- **Entities:** `EmployeeIncentiveRule` (`employee_incentive_rules`) — % on ALL_SALES/CATEGORY/ITEM/BRAND slice.
- **Service:** rule CRUD; `computeForPeriod(from,to,employeeId?)` walks sale lines, deducts returns, returns rows + per-employee totals; `totalForPeriod`.
- **Controller:** `/employee-incentives/rules*`, `GET /employee-incentives/{compute,total}`.

### incentives
- **Entities:** `IncentiveTarget` (`incentive_targets`) — ITEM/BRAND qty target unlocks per-unit credit; `IncentiveAward` (`incentive_awards`) — recorded payout.
- **Service:** target CRUD + `targetProgress/allTargetProgress`; `effectiveCostAdjustments()` (per-unit credit once `triggerThresholdPct` crossed — POS cost hint, **not** snapshotted); award CRUD + `awardsTotal`.
- **Controller:** `/incentives/targets*`, `GET /incentives/cost-adjustments`, `/incentives/awards*`.

## reports (read-only)
- **Purpose:** Ledgers, financial statements, aging, analytics. Touches every business entity; **never writes**.
- **Service (~2200 LOC):** Ledgers — customer/supplier/account/employee + `stockLedger` (running balance). Statements — `incomeStatement`, `balanceSheet`, `cashFlow`, `equityChanges` (+ journal-driven variants `*FromJournals`, `trialBalance`). Aging — `arAging`/`apAging` (+ per-party detail, 0-30/30-60/60-90/90+). Analytics — `itemMargins` (uses `costAtSaleTime`), `slowMovingStock`, `marginAnalytics` (by brand / low-margin / high-discount).
- **Controller:** GET-only, mirrors the service (consumed by `Financials.js` + ledger pages).

---

# Frontend (erp-frontend/src)

### Shell & routing — App.js
- `ThemeProvider → HashRouter → AuthProvider`; auth guard before render. HashRouter is required for Electron `file://`/`app://`.
- Top-level: `/login`, `/` (Dashboard), `/pos`, `/cash-register`, `/master`, `/transactions`.
- Hub-wrapped (horizontal tab strip via `HubFrame`): **Customer** (customers, receipts, customer-ledger, warranty-lookup, service-tickets) · **Sales** (sales-voucher, sales, sale-returns, deliveries, overdue-bookings) · **Supplier** (suppliers, brands, payments, incentives, supplier-ledger) · **Purchase** (purchase-orders, purchases, purchase-returns) · **Item** (items, categories) · **Stock** (stores, stock, stock-ledger, stock-transfers, damaged-goods) · **Employee** (employees, attendance, employee-payments, employee-incentive-rules, employee-ledger) · **Account** (accounts, fund-transfers, account-ledger) · **Users** (superuser-gated) · **System** (backup, audit-log, error-log).
- Print routes: `/print/{sale,purchase}/:id`, `/print/serial-label/:serial`, `/print/booking-receipt/:id`, `/print/box-tag/:id`.

### API client — src/api/client.js
- Base URL: `REACT_APP_API_BASE_URL` → `http://<hostname>:3001/api` → `localhost:3001` (Electron `file://` fallback).
- Token in `localStorage['hassan-auth-token']`, sent as `Authorization: Bearer`; 401 clears + redirects to login.
- `getCached()` — 10s in-memory cache + in-flight dedup for GETs; mutations invalidate cache; `{ fresh: true }` bypasses. Errors expose `err.uiMessage`.

### Pages — src/pages/
Dashboard, Login, MasterData (generic CRUD hub → ItemsPanel/CategoriesPanel), SalesVoucher (bill-book entry → `POST /sales/voucher`), Sales/SaleReturns/Purchases/PurchaseReturns/PurchaseOrders (read-only history + ReverseAction), Receipts/Payments (VoucherPage wrappers, direction IN/OUT), Stock, StockLedger, StockTransfers, DamagedGoods, {Customer,Supplier,Account,Employee}Ledger (LedgerView + AgingPanel), Attendance, EmployeePayments, EmployeeIncentiveRules, Incentives, FundTransfers, CashRegister, POS (scan/cart/F-key shortcuts), Financials (multi-tab reports), Backup, AuditLog, ErrorLog, UsersInfo, UsersAllowAccess, UsersRecentLogin, UsersChangePassword, Transactions (gallery), InvoicePrint, SerialLabelPrint, BookingReceiptPrint, BoxTagPrint, WarrantyLookup (serial/receipt/customer/model modes), ServiceTickets, Deliveries, OverdueBookings.

### Components — src/components/
Layout (sidebar+topbar+outlet, rail toggle, GlobalSearch, SyncButton, ThemeToggle), HubFrame (tab strip, filters superuserOnly), CrudPage (generic table+form CRUD), VoucherPage (IN/OUT voucher with running balance), LedgerView, AgingPanel, MiniCharts (StackedBar/Donut/HorizontalBars), ExportButtons (CSV/Excel), Brand, Logo, Icon, ThemeToggle, ReverseAction, GlobalSearch (Ctrl/Cmd+K), SyncButton; `master/ItemsPanel.js` + `master/CategoriesPanel.js` (custom inline editors).

### Hooks — src/hooks/
`useResource(path)` → `{ data, loading, error, reload, fetch }` (cached GET, auto-fetch on mount); `useUnsavedChangesPrompt()` (block nav on dirty forms).

### Nav & theme
`src/nav/hubs.js` — `HUBS` (10 hub defs: label/title/subtitle/icon/colorVar/defaultTo/paths/tabs) + flat `SIDEBAR` list. `src/theme/ThemeContext.js` — light/dark via `data-theme` on `<html>`, persisted, calls `window.erpBridge.setTitleBarTheme` in Electron; `tokens.css` (CSS variables, loaded after `App.css`).

---

# Electron (erp-desktop/src)

### main.js
Single-instance lock; registers privileged `app://` scheme serving the React build (SPA fallback to index.html) — **never** `file://`; splash while backend boots; spawns `erp-backend/dist/main.js` as a child (`ELECTRON_RUN_AS_NODE=1`, `PORT=3001`, `SQLITE_PATH=<userData>/erp.sqlite`, `BACKUP_DIR=<userData>/backups`); polls `/api/health` (up to 5 min); hidden title bar + `titleBarOverlay` repainted per theme via `erp:set-titlebar-theme` IPC; reads `<userData>/config.json` for `cloudSyncUrl`/`databaseUrl`; no native menu.

### preload.js
Context bridge exposing `window.erpBridge.setTitleBarTheme(theme)` over IPC (CSP-safe).

---

# Scripts (scripts/)

`make-icons.ps1` — chroma-keys `erp-frontend/logo.jpeg` black backdrop to alpha, emits `logo192/512/1024.png` + multi-res `favicon.ico` into `erp-frontend/public/`, copies the ICO to `erp-desktop/build-resources/icon.ico`.

---

# Seeder — erp-backend/src/seed.ts

`npm run seed` (`SEED_SCALE=light|medium|heavy`, heavy default). Boots the app context (forces local SQLite by blanking `DATABASE_URL`), **detaches `AuditSubscriber`** (its fire-and-forget writes poison transactions under load), and drives the real services to generate a coherent stress dataset across every module. Single-writer: stop the dev server first. See README "Seed stress-test data".
