# Codebase Map — Hassan Electronics ERP

> **What this is:** a module-and-key-files index so the codebase doesn't have to be re-read from scratch each session. For architecture, conventions, run instructions, and the domain model, read [CLAUDE.md](../CLAUDE.md) and [README.md](../README.md) first — this file is the "where does X live" companion to them.
>
> **⚠ STALE — structure moved.** The repo was reorganized into a monorepo: the four projects now live under `apps/` (e.g. `apps/erp-backend/`, `apps/erp-frontend/`), dev docs under `docs/`, and this file lists pre-move paths below. Prefix the `erp-*/` paths in this document with `apps/`. Regenerate this map against a working checkout ("refresh the codebase map") to fully resync.
>
> **Freshness:** regenerated against commit `0782938` on 2026-06-16 (pre-monorepo-move). A `SessionStart` hook checks whether any source file changed since this file was last written and reminds Claude to regenerate it. To refresh manually, just say "refresh the codebase map". When you regenerate, update the commit/date stamp above.
>
> **Counts (verified):** 36 NestJS feature modules under `src/modules/` (one `.module.ts` per folder; all 36 imported in `app.module.ts`) · 48 domain entities + a `settings` table (50 `*.entity.ts` files; `base.entity.ts` is the abstract `BaseEntity`) · 14 Jest spec files / 157 passing tests.

---

## Layout

```
apps/erp-backend/    NestJS 11 + TypeORM 0.3 — 36 feature modules under src/modules/, one folder per module
                (entities/, dto/, <name>.service.ts, <name>.controller.ts, <name>.module.ts).
                src/main.ts (bootstrap: scoped body-limits, Helmet CSP, CORS allowlist, global
                ValidationPipe + ErrorLogFilter, migrate-on-boot), src/app.module.ts (DB dialect switch +
                module wiring), src/app.controller.ts (GET /api/health, @Public), src/seed.ts (stress-test
                seeder), src/data-source.ts (TypeORM CLI DataSource), src/common/ (BaseEntity, Setting,
                delete-guard, sqlite-checkpoint), src/testing/test-db.ts (in-memory SQLite for specs),
                src/migrations/ (TypeORM migrations — infra present, no files yet).
apps/erp-frontend/   React 19 + HashRouter + axios. src/pages/, src/components/, src/hooks/, src/api/client.js,
                src/nav/hubs.js, src/theme/, src/utils/exporters.js, src/styles/ (tokens.css + app.css),
                public/ (index.html, theme-bootstrap.js, manifest.json, icons).
apps/erp-desktop/    Electron 40 wrapper. src/main.js, src/preload.js, scripts/ (prepare-resources, rebuild-native,
                postinstall), build-resources/ (icon.ico, installer.nsh, config.example.json).
apps/erp-mobile/     Expo SDK 57 / React Native read-only Android companion (App.js, src/, supabase/setup.sql).
packages/       Reserved for shared code across apps (empty placeholder).
scripts/        make-icons.ps1 (run from repo root).
docs/           CODEBASE_MAP.md (this file), design.md, handoff.md, Manual.txt (gitignored).
local/          GITIGNORED working data: secrets, mobile-signing keystore, live db, backups, repo bundles.
package.json    Monorepo root — orchestration scripts (`npm run dev:backend` / `build:web` / …). NOT npm-workspaces (no `workspaces`); each app installs independently.
```

Cross-cutting conventions (don't re-derive — see CLAUDE.md): global `AuthGuard` (opaque bearer tokens, `@Public()` exempts, `@SuperuserOnly()` gates); snake_case DB columns via `name:`; `@Column({ type: Date })` not `'timestamp'`/`'datetime'` (`'date'` string columns are OK on both dialects); voucher numbers via `SequenceService` (`PREFIX-000123`, count-seeded, not gap-free); audit via `AuditSubscriber`; errors captured by `ErrorLogFilter`; double-entry journals posted inside each service's own transaction; module dependency on `OutboxService` (never `SyncModule`) to avoid circular deps.

---

# Backend modules

Module load order in `app.module.ts`: Sequence, Periods, Journals, Brands, Categories, Items, Customers, Suppliers, Stores, Accounts, Stock, Sales, Purchases, Returns, Payments, Outbox, Sync, Pos, Reports, FundTransfers, CashRegister, Incentives, Employees, EmployeeTransactions, Attendance, EmployeeIncentives, PurchaseOrders, StockTransfers, DamagedGoods, Backup, AuditLogs, ErrorLogs, Users, ItemSerials, ServiceTickets, Deliveries. `@Global()` modules: Sequence, Periods, Journals, Accounts, Users, ItemSerials.

## Platform / cross-cutting

### users (`@Global`)
- **Files:** `users.module.ts`, `users.service.ts`, `users.controller.ts`, `auth.controller.ts`, `auth.guard.ts`, `auth.decorators.ts`, `password.util.ts`, `reauth.service.ts`, `entities/{user,user-access-request,user-login-event}.entity.ts`, `dto/`.
- **Entities:** `User` (`users`) — username, scrypt `passwordHash` (`scrypt:salt:hash`), role SUPERUSER|USER, sliding `sessionToken` (unique, rotates on login + password change), `sessionExpiresAt`, `lastLoginAt`; `UserAccessRequest` (`user_access_requests`) — PENDING/APPROVED/REJECTED signup requests, reviewer/createdUser ids; `UserLoginEvent` (`user_login_events`) — one row per successful login, `seenByAdmin`.
- **Service (`UsersService`):** `onModuleInit()` seeds `admin`/`Tech@123` SUPERUSER (idempotent); `login(username,password,meta)` verify + 12h sliding token + insert login event (superuser logins pre-marked seen); `logout()`; `resolveSession(token)` (slides expiry only if bump > 60s); `changeOwnPassword()` (rotates own token); superuser CRUD `createUser/updateUser/removeUser` with `guardLastSuperuser` + self-protection (can't delete/deactivate/demote self, password reset of others kicks their session); access-request `requestAccess/listAccessRequests/pendingAccessRequestCount/approveAccessRequest/rejectAccessRequest/removeAccessRequest`; login-event `listLoginEvents/unseenLoginCount/markLoginEventsSeen/clearLoginEvents` (keeps last 30 days). `toPublic()` strips secrets.
- **`ReauthService`:** in-memory `Map`, 60s single-use tokens (deleted-on-consume even on mismatch); `issue/consume`. Header `x-reauth-token`. Gates backup restore/download.
- **Controllers:** Public `POST /auth/login`, `POST /auth/request-access`. Auth'd `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`, `POST /auth/reauthenticate`. Class-level `@SuperuserOnly` on `UsersController`: `GET/POST /users`, `PATCH/DELETE /users/:id`, `/users/access-requests*` (+`/pending-count`, `/:id/approve`, `/:id/reject`), `/users/login-events*` (+`/unseen-count`, `/mark-seen`).
- **Notable:** `AuthGuard` registered here as global `APP_GUARD`. Two roles only. scrypt (not bcrypt) for Windows/Electron-friendliness; constant-time verify.

### sequences (`@Global`)
- **Files:** `sequence.module.ts`, `sequence.service.ts`, `entities/sequence.entity.ts`, `sequence.service.spec.ts`.
- **Entities:** `Sequence` (`sequences`) — `prefix` PK (varchar 32), `nextValue`.
- **Service:** `next(prefix, seedFromMax?)` — transactional allocate, `pessimistic_write` lock on Postgres / single-writer on SQLite, seeds `nextValue` from `seedFromMax()+1` only on first allocation, returns `PREFIX-000123` (6-digit pad).
- **Notable:** No controller. Single source for INV/BILL/SR/PR/RCT/PMT/TRF/PO/SVC/DLV/EMP/CUST/SUPP/ACC/STK-TRF/DMG/JE/per-type employee-txn prefixes. Not gap-free.

### journals (`@Global`)
- **Files:** `journal.module.ts`, `journal.service.ts`, `journals.controller.ts`, `entities/{journal-entry,journal-line}.entity.ts`, `journal.service.spec.ts`.
- **Entities:** `JournalEntry` (`journal_entries`) — `entryNumber` (`JE-…`, unique), `entryDate`, `sourceModule` (SALE/PURCHASE/RECEIPT/PAYMENT/FUND_TRANSFER/PAYROLL/INCENTIVE_AWARD/ADJUSTMENT/OPENING_BALANCE/REVERSAL), `sourceRef`, `reversesJournalEntryId`, `lines` cascade-insert; `JournalLine` (`journal_lines`) — `accountId`, one positive `debit` or `credit`, `narration`.
- **Service (`JournalService`):** `post(input, manager?)` — joins caller's transaction; validates ≥2 lines, one-sided lines, balance (Dr=Cr ±0.005 `BALANCE_TOLERANCE`), period open (`periods.assertOpen`), non-control accounts; `reverse(sourceEntryId, opts, manager?)` idempotent (keyed on `reversesJournalEntryId`); `findBySource(module, ref)`.
- **Controller:** read-only `GET /journals?from=&to=&limit=`, `GET /journals/:id` (both relations `['lines']`). Postings never via HTTP — only inside other services' transactions.
- **Notable:** HARD_CLOSED periods reject; SOFT_CLOSED allow; no covering period ⇒ open. Control accounts never receive postings.

### periods (`@Global`)
- **Files:** `periods.module.ts`, `periods.service.ts`, `periods.controller.ts`, `entities/accounting-period.entity.ts`, `dto/{create-period,close-period}.dto.ts`, `periods.service.spec.ts`.
- **Entities:** `AccountingPeriod` (`accounting_periods`) — name, `startDate`/`endDate`, status OPEN/SOFT_CLOSED/HARD_CLOSED, `closedAt/closedBy/closeReason`.
- **Service:** `create()` (no overlaps), `softClose` (rejects if already HARD_CLOSED), `hardClose`/`reopen` (no guards), `assertOpen(date)` (throws only on HARD_CLOSED), `findCovering(date)`, `findAll/findOne`.
- **Controller:** `GET/POST /periods`, `POST /periods/:id/{soft-close,hard-close,reopen}`.
- **Notable:** Date with no covering period ⇒ implicitly OPEN (fresh installs not blocked).

### outbox
- **Files:** `outbox.module.ts`, `outbox.service.ts`, `entities/sync-queue.entity.ts`.
- **Entities:** `SyncQueueEntry` (`sync_queue`) — type, JSON `payload`, status PENDING/SYNCED/FAILED, `attempts`, `error`, `lastAttemptAt`.
- **Service:** `enqueue(type,payload)`, `list()` (200), `countPending/countFailed`, `pending()` (all, no cap), `failed()` (200), `retry(id)`, `save()`.
- **Notable:** Only thing sales/purchases/POS and the sync pusher share — do **not** make those import `SyncModule` (circular). No controller. No auto-retry of FAILED rows (poison-pill isolation).

### sync
- **Files:** `sync.module.ts`, `sync.service.ts`, `sync.controller.ts`, `hmac.util.ts`, `sync-signature.guard.ts`, `entities/sync-event.entity.ts`, `dto/sync-push.dto.ts`, `{sync.service,hmac.util,sync-signature.guard}.spec.ts`.
- **Entities:** `SyncEvent` (`sync_events`) — client UUID `id` = idempotency key (PrimaryColumn, not generated), status PROCESSED/FAILED/DUPLICATE, `resultId`, `receivedAt`.
- **Service (`SyncService`):** inbound `push(events)` → per-event `handleEvent` (dedupe by id → DUPLICATE; SALE_CREATED/POS_SALE_CREATED strip `sessionId` → `salesService.create(..,{skipOutbox})`, PURCHASE_CREATED → `purchasesService.create`, POS_SESSION_* no-op; unknown type → FAILED; never throws out); outbound `pushPending()` (refuses if `CLOUD_SYNC_URL`/`SHOP_ID`/`SHOP_SYNC_SECRET` unset; single-flight `isPushing`; signs body, identity `transformRequest`; returns `SyncRunSummary`); `listQueue/pendingCount/failedCount/listFailed/retryFailed` passthroughs.
- **HMAC:** `signSyncRequest`/`verifySyncRequest` over `timestamp\nbody`, 5-min skew window, `timingSafeEqual`. `SyncSignatureGuard` reads `SHOP_ID`+`SHOP_SYNC_SECRET` (no dev-bypass).
- **Controller:** `POST /sync/push` (`@Public` + `SyncSignatureGuard`), `GET /sync/{events,queue,status,failed}`, `POST /sync/failed/:id/retry`, `POST /sync/flush` (manual push).
- **Notable:** **Manual flush only** — `ScheduleModule.forRoot()` imported but NO `@Cron`. Body canonicalization relies on Node V8 JSON key-order stability on both ends. ⚠️ `handleEvent` has **no case for `SALE_VOUCHER_CREATED`** even though `SalesService.createFromVoucher` enqueues it — voucher sales hit the `default → FAILED` branch on the cloud and don't propagate yet. Inversely, `POS_SESSION_STARTED` is a receiver no-op case that no local producer enqueues.

### audit-logs
- **Files:** `audit-logs.module.ts`, `audit-logs.service.ts`, `audit-logs.controller.ts`, `audit.subscriber.ts`, `entities/audit-log.entity.ts`.
- **Entities:** `AuditLog` (`audit_logs`, own PK not BaseEntity) — entityType, entityId, action CREATE/UPDATE/DELETE, human `summary`, JSON `changes`, source (always `'system'` — no request context).
- **Service:** `record()` **fire-and-forget** (swallows errors, never blocks the op); `findAll()` filtered, cap 5000.
- **Controller:** `@SuperuserOnly` `GET /audit-logs?entityType&action&from&to&limit`.
- **Notable:** `AuditSubscriber` self-registers on boot. SKIP set: AuditLog/ErrorLog/OutboxEvent + User/UserAccessRequest/UserLoginEvent. Only `SUMMARY_KEYS` captured. ⚠️ Un-awaited `record()` interleaves with `dataSource.transaction()` under tight loops (see `seed.ts`, which detaches the subscriber to avoid "no such savepoint").

### error-logs
- **Files:** `error-logs.module.ts`, `error-logs.service.ts`, `error-logs.controller.ts`, `error-log.filter.ts`, `entities/error-log.entity.ts`.
- **Entities:** `ErrorLog` (`error_logs`, own PK) — level ERROR/WARN, source, method/path/statusCode, message, stack, context (JSON).
- **Service:** `record()` (swallowed), `findAll()` (cap 5000), `clear()`.
- **Filter:** `ErrorLogFilter` (`@Catch()`, registered globally in `main.ts`) — preserves Nest's default response shape, logs every error; 5xx → ERROR + `logger.error`, 4xx/404 → WARN.
- **Controller:** `@SuperuserOnly` `GET /error-logs?level&source&from&to&limit`, `DELETE /error-logs`.

### backup
- **Files:** `backup.module.ts`, `backup.service.ts`, `backup.scheduler.ts`, `backup.controller.ts`, `entities/backup.entity.ts`, `dto/{set-schedule,restore}.dto.ts`. Uses `common/entities/setting.entity.ts`.
- **Entities:** `Backup` (`backups`) — fileName, filePath, sizeBytes, format JSON, trigger AUTO/MANUAL, `sha256`, `verifiedAt`.
- **Service:** `dumpAll()` (walks `entityMetadatas` + M2M junction tables, skips EXCLUDED), `createBackup`, `streamSnapshot()` (in-memory, no row), `list/findOne/readFile/verify/remove`, `getScheduledHour/setScheduledHour`, `status()`, `runScheduledIfDue()`, `restoreFromSnapshot()` (destructive; `confirm='RESTORE'` + reauth; auto pre-restore safety backup; FK enforcement toggled off in a transaction; reverse-delete then forward-reinsert + M2M).
- **`BackupScheduler`:** `@Cron(EVERY_HOUR)` → `runScheduledIfDue()`.
- **Controller:** `POST/GET /backup`, `GET /backup/download-now` (`@SuperuserOnly`), `GET /backup/{status,schedule}`, `POST /backup/schedule`, `POST /backup/:id/verify` (`@SuperuserOnly`), `GET /backup/:id/download` (`@SuperuserOnly`), `DELETE /backup/:id`, `POST /backup/restore` (`@SuperuserOnly` + reauth header / legacy password).
- **Notable:** `EXCLUDED_TABLES` = backups + all user/auth tables (re-seeded on boot; prevents superuser injection from a tampered backup). `BACKUP_DIR` defaults to cwd/backups; Electron forces `<userData>/backups`.

## Master data

### items (exports `TypeOrmModule`)
- **Files:** `items.module.ts`, `items.service.ts`, `items.controller.ts`, `entities/item.entity.ts`, `dto/{create,update}-item.dto.ts`, `items.service.spec.ts`.
- **Entities:** `Item` (`items`) — `sku` unique, optional `barcode` unique, `modelNo`, optional `brandId` (eager), M2M `categories` via `item_categories`. Warranty: `hasWarranty`, `warrantyType` (COMPANY|SHOP|CHECKING_ONLY|NONE), `warrantyDays`. Serials: `tracksSerials`, `serialRequiredOnSale`, `isInternalGenerated`. Costing: `purchasePrice` (UI default only), `avgCost`, `costedQty`, `reservedQty`. Pricing: `salePrice`, `unit`, `minStockLevel`.
- **Service:** `create()` derives SKU from modelNo (collision → -2/-3), `name` falls back to modelNo; `findAll` (modelNo ASC); `search(q,limit)` ILIKE; `findByCode()` POS exact (barcode→sku); `update` (re-checks unique on change); `remove` via `deleteOrConflict`; `ensureUniqueCodes`, `resolveCategories`.
- **Controller:** `POST/GET /items`, `GET /items/lookup?code=`, `GET /items/search?q=&limit=`, `GET/PATCH/DELETE /items/:id`.
- **Notable:** `avgCost`+`costedQty` are the costing source of truth, **never** `purchasePrice` for accounting.

### brands
- **Files:** `brands.{module,service,controller}.ts`, `entities/brand.entity.ts`, `dto/create-brand.dto.ts`.
- **Entities:** `Brand` (`brands`) — name, description, isActive. (Module is the only master-data one that does NOT re-export TypeOrmModule.)
- **Service/Controller:** plain CRUD `POST/GET /brands`, `GET/PATCH/DELETE /brands/:id`; `remove` via `deleteOrConflict('brand')`.

### categories (exports `TypeOrmModule`)
- **Files:** `categories.{module,service,controller}.ts`, `entities/category.entity.ts`, `dto/create-category.dto.ts`, `categories.service.spec.ts`.
- **Entities:** `Category` (`categories`) — self-referencing tree (`parentId`, `onDelete: SET NULL`), optional uppercase `code` (≤8) used in `LOCAL-<code>-<year>-<seq>` serials.
- **Service:** `create/update` with `ensureExists` (parent), `ensureNoCycle`, `ensureCodeUnique` (app-layer, dialect-portable); `tree()` nested roots; `remove` (NO delete-guard — relies on SET NULL for children).
- **Controller:** `POST/GET /categories`, `GET /categories/tree`, `GET/PATCH/DELETE /categories/:id`.

### customers (exports `TypeOrmModule`; uses `SequenceService`)
- **Files:** `customers.{module,service,controller}.ts`, `entities/customer.entity.ts`, `dto/create-customer.dto.ts`.
- **Entities:** `Customer` (`customers`) — `code` DB-unique (`CUST-…`), `openingBalance`, `creditLimit`, `creditEnabled` (default **false**), contact fields.
- **Service:** `onModuleInit` → `backfillCodes()`; `create` assigns code if blank; standard CRUD; `remove` via `deleteOrConflict('customer')`.
- **Controller:** standard 5 routes `/customers`. Credit enforcement lives in POS/Sales, not here.

### suppliers (exports `TypeOrmModule`; uses `SequenceService`)
- **Files:** `suppliers.{module,service,controller}.ts`, `entities/supplier.entity.ts`, `dto/create-supplier.dto.ts`.
- **Entities:** `Supplier` (`suppliers`) — `code` DB-unique (`SUPP-…`), `openingBalance`, contact fields. Mirror of customers (no credit fields).
- **Service:** `onModuleInit` backfill, code-on-create, CRUD, `deleteOrConflict('supplier')`.
- **Controller:** standard 5 routes `/suppliers`.

### stores (exports `TypeOrmModule`)
- **Files:** `stores.{module,service,controller}.ts`, `entities/store.entity.ts`, `dto/create-store.dto.ts`.
- **Entities:** `Store` (`stores`) — name, location, isActive (no codes).
- **Service/Controller:** plain CRUD `/stores`; `deleteOrConflict('store')`.

### employees (exports `TypeOrmModule`; uses `SequenceService`, `EmployeeTransactionsModule`)
- **Files:** `employees.{module,service,controller}.ts`, `salary-accrual.service.ts`, `entities/employee.entity.ts`, `dto/{create,update}-employee.dto.ts`.
- **Entities:** `Employee` (`employees`) — `code` unique (`EMP-…`), `monthlySalary`, `openingBalance`, `joinedAt`, `salaryDay` (1–31, null disables), `firstSalaryInAdvance`.
- **Service (`EmployeesService`):** `onModuleInit` backfill, code-on-create, CRUD, `deleteOrConflict('employee')`.
- **`SalaryAccrualService`:** `@Cron(EVERY_HOUR) hourlyTick` → `accrueDueNow(employeeId?)` — books one `SALARY_ACCRUED` employee-txn per (employee, calendar month), idempotent via date-range lookup.
- **Controller:** `POST/GET /employees`, `POST /employees/accrue-salaries`, `GET/PATCH/DELETE /employees/:id`, `POST /employees/:id/accrue-salary`.

## Inventory

### stock (exports `StockService`)
- **Files:** `stock.{module,service,controller}.ts`, `entities/stock-movement.entity.ts`, `dto/stock-adjustment.dto.ts`, `stock.service.spec.ts`.
- **Entities:** `StockMovement` (`stock_movements`) — append-only; IN/OUT, positive `quantity`, `referenceType` (PURCHASE/SALE/PURCHASE_RETURN/SALE_RETURN/ADJUSTMENT/SALE_REVERSAL/PURCHASE_REVERSAL), `referenceId`, `note`, optional `storeId`.
- **Service:** `recordMovement(input, manager?)` — the single ledger writer; positive-qty guard + negative-stock guard on OUT; `adjust()` (referenceType ADJUSTMENT, referenceId `'manual'`); `getOnHand(itemId, storeId?)` (SUM IN−OUT); `listMovements()` (cap 500); `stockSummary()` (onHand + min + reserved + avgCost + `available = max(0, onHand-reserved)` + `valueAtCost`).
- **Controller:** `GET /stock/summary`, `GET /stock/on-hand?itemId=&storeId=`, `GET /stock/movements`, `POST /stock/adjust`.
- **Notable:** Consumed by sales/purchases/pos/returns/stock-transfers/damaged-goods — all pass their `EntityManager` so movements join the parent transaction.

### item-serials (`@Global`)
- **Files:** `item-serials.{module,service,controller}.ts`, `entities/item-serial.entity.ts`, `dto/register-serials.dto.ts`.
- **Entities:** `ItemSerial` (`item_serials`) — `serial` globally unique; two orthogonal axes `status` (IN_STOCK/SOLD/RETURNED/DAMAGED/WRITE_OFF) and `allocationStatus` (AVAILABLE/BOOKED/DELIVERED, property-indexed); `bookedAt`, soft `purchaseBillNo`/`saleInvoiceNo` links; frozen warranty (type/days/start/end); `isInternalGenerated`.
- **Service (`OnModuleInit`):** backfills null `allocationStatus`; `registerStock()` (idempotent batch intake), `bindToSale()` (SOLD + DELIVERED + warranty freeze), `reserveForBooking()` (BOOKED, stays IN_STOCK), `releaseBooking()`, `markDelivered()`, `markReturned()`, `unbindFromInvoice()` (reversal), `generateLocalSerials()` (per-(code,year) Sequence counter), `listAvailableForItem()`, `list()` (cap 500), `lookupWarranty()` (public, no PII).
- **Controller:** `GET /item-serials?itemId=&status=&saleInvoiceNo=`, `GET /item-serials/available?itemId=`, `POST /item-serials`, `POST /item-serials/generate-local`, `GET /item-serials/warranty/:serial` (`@Public`).
- **Notable:** Registers `Item`+`Category`+`Sequence` for the local-mint flow. Don't collapse `status`+`allocationStatus`.

### stock-transfers (exports `StockTransfersService`; imports `StockModule`)
- **Files:** `stock-transfers.{module,service,controller}.ts`, `entities/{stock-transfer,stock-transfer-item}.entity.ts`, `dto/create-stock-transfer.dto.ts`.
- **Entities:** `StockTransfer` (`stock_transfers`) + `StockTransferItem` (`stock_transfer_items`).
- **Service:** `create()` — rejects from==to; per line books OUT@source + IN@dest (referenceType ADJUSTMENT, referenceId = transfer id) in one transaction (all-or-nothing); `transferNo` via `STK-TRF`; `findAll/findOne`. Immutable after create.
- **Controller:** `POST /stock-transfers`, `GET /stock-transfers?fromStoreId=&toStoreId=`, `GET /:id`.

### damaged-goods (exports `DamagedGoodsService`; imports `StockModule`)
- **Files:** `damaged-goods.{module,service,controller}.ts`, `entities/damaged-good.entity.ts`, `dto/{create-damaged-good,update-status}.dto.ts`.
- **Entities:** `DamagedGood` (`damaged_goods`) — status DAMAGED/IN_REPAIR/WRITE_OFF (+REPAIRED via update), `voucherNo` (`DMG-…`), reportedOn/resolvedOn.
- **Service:** `create()` books stock OUT; `updateStatus()` flips status (REPAIRED books IN; REPAIRED→out-status re-books OUT); `remove` blocked while out-of-stock; `tally()`.
- **Controller:** `POST /damaged-goods`, `GET /damaged-goods?status=`, `GET /damaged-goods/tally`, `GET /:id`, `PATCH /:id/status`, `DELETE /:id`.

## Sales side

### sales (exports `SalesService`; imports `StockModule`, `OutboxModule`)
- **Files:** `sales.{module,service,controller}.ts`, `entities/{sale,sale-item}.entity.ts`, `dto/{create-sale,create-sale-voucher,settle-commitment,reverse-sale}.dto.ts`, `sales.service.spec.ts`.
- **Entities:** `Sale` (`sales`) — invoiceNo, customer (eager), totals, `paymentMethod` (CASH/CARD/BANK/CREDIT), `paymentCommitments` JSON (`SalePaymentCommitment[]`), `amountPaidSettled`, `dueAmount`, reversal meta; `SaleItem` (`sale_items`) — qty/price, `costAtSaleTime` (COGS snapshot), line-level warranty snapshot.
- **Service:** `create(dto,{skipOutbox?})` wraps `createInTransaction()` — build lines, decrement `costedQty`, stamp model-only warranty, stock OUT, credit-limit gate (`creditEnabled`+`creditLimit` via `customerOutstanding`), post journal (Dr Cash/A_R/DEFERRED, Cr Revenue, Dr COGS, Cr Inventory), enqueue `SALE_CREATED`; `createFromVoucher()` — sale (CREDIT, paid 0) + N receipt splits (CASH / CUSTOMER_CREDIT kinds) + serial binding branched on final `dueAmount`, enqueues `SALE_VOUCHER_CREATED`; `reverse()` (idempotent, balancing journal + stock IN SALE_REVERSAL + restore costedQty + `unbindFromInvoice`); `settleCommitment()` (caps at residual, surfaces `overflow`, flips serials DELIVERED when paid); `releaseBooking()` (reuse `reverse` with RELEASE-TO-FLOOR prefix, no auto-refund); `upcomingDeferred()` (hardcoded 7-day); `overdueBookings(minDays)`; warranty `warrantyByInvoice/ByCustomer/ByModel`.
- **Controller:** `POST /sales`, `POST /sales/voucher`, `GET /sales`, `GET /sales/deferred/upcoming`, `GET /sales/overdue-bookings?minDays=`, `GET /sales/warranty/{by-invoice/:invoiceNo,by-customer/:customerId,by-model}` (declared above `:id`), `GET /sales/:id`, `POST /sales/:id/{reverse,settle-commitment,release-booking}`.
- **Notable:** Page is read-only history (POS/voucher driven). COGS basis = `costAtSaleTime`. Route order load-bearing.

### pos (exports `PosService`; imports `ItemsModule`, `SalesModule`, `OutboxModule`)
- **Files:** `pos.{module,service,controller}.ts`, `entities/{pos-session,pos-cart-item}.entity.ts`, `dto/{start-session,close-session,add-to-cart,update-cart-item,checkout}.dto.ts`, `pos.service.spec.ts` (18 cases).
- **Entities:** `PosSession` (`pos_sessions`) — running `salesTotal`/`salesCount`, ACTIVE/CLOSED, `openingFloat`; `PosCartItem` (`pos_cart_items`) — session-scoped, stacks by `sessionId+itemId`, cleared on checkout.
- **Service:** `startSession/closeSession` (enqueues `POS_SESSION_CLOSED`), `getActiveSession/findSession/listSessions`, cart `addToCart` (stacks, overwrites price)/`updateCartItem`/`removeCartItem`/`clearCart`/`listCart`, `checkout()` — partial-pay-needs-customer + CREDIT-needs-customer + serial-count guards, calls `SalesService.create(..,{skipOutbox})`, binds serials (`reserveForBooking` if `dueAmount>0.005` else `bindToSale` per serial), updates session totals, enqueues `POS_SALE_CREATED`.
- **Controller:** `POST /pos/sessions`, `GET /pos/sessions[/active|/:id]`, `POST /pos/sessions/:id/close`, `GET /pos/lookup?code=`, cart routes under `/pos/sessions/:id/cart` + `/pos/cart/:cartItemId`, `POST /pos/sessions/:id/checkout`.
- **Notable:** Booking threshold `dueAmount > 0.005`. CREDIT forces `paidAmount=0` + strips `accountId`.

### returns (exports `ReturnsService`; imports `StockModule`)
- **Files:** `returns.{module,service,controller}.ts`, `entities/{sale-return,sale-return-item,purchase-return,purchase-return-item}.entity.ts`, `dto/{create-sale-return,create-purchase-return}.dto.ts`.
- **Entities:** `SaleReturn`+`SaleReturnItem` (`sale_returns`/`sale_return_items`), `PurchaseReturn`+`PurchaseReturnItem` (`purchase_returns`/`purchase_return_items`).
- **Service:** `createSaleReturn()` (`SR-…`) → stock IN + restore costedQty + best-effort `markReturned` per serial; `createPurchaseReturn()` (`PR-…`) → stock OUT + decrement costedQty; `list*/find*`. No journal, no outbox.
- **Controller:** `POST/GET /sale-returns[/:id]`, `POST/GET /purchase-returns[/:id]` (root-level paths, no controller prefix).

### deliveries (exports `DeliveriesService`; imports `SequenceModule`)
- **Files:** `deliveries.{module,service,controller}.ts`, `entities/delivery.entity.ts`, `dto/create-delivery.dto.ts`.
- **Entities:** `Delivery` (`deliveries`) — 6 statuses (PENDING/OUT_FOR_DELIVERY/DELIVERED/INSTALLATION_PENDING/INSTALLED/CANCELLED), `RESERVING_STATUSES` hold inventory; auto-fills phone/address from linked sale.
- **Service:** `create()` (`DLV-…`) → `applyReservation(+1)` if reserving; `update()` enforces **Strict Delivery Handover** (block DELIVERED while `sale.dueAmount > 0.005`) + reservation flip; `remove()` releases reservation; `tally()`; `applyReservation()` writes `Item.reservedQty` overlay (no-op if no saleId).
- **Controller:** `GET /deliveries`, `GET /deliveries/tally`, `POST /deliveries`, `GET/PATCH/DELETE /deliveries/:id`.
- **Notable:** Gate DELIVERED **only** on `dueAmount`.

### service-tickets (exports `ServiceTicketsService`; imports `SequenceModule`)
- **Files:** `service-tickets.{module,service,controller}.ts`, `entities/service-ticket.entity.ts`, `dto/create-service-ticket.dto.ts`.
- **Entities:** `ServiceTicket` (`service_tickets`) — `ticketNo` (`SVC-…`), soft links `itemSerialId` **and** `saleItemId` (model-only path) + `itemDescription`, `inWarranty` snapshot, 7 statuses (RECEIVED…UNREPAIRABLE), cost fields.
- **Service:** `create()`, `update()` (auto-stamp `deliveredAt` on DELIVERED; no transition validation), `tally()`, CRUD. No stock/journal side effects.
- **Controller:** `GET /service-tickets`, `GET /service-tickets/tally`, `POST`, `GET/PATCH/DELETE /:id`.

## Purchasing

### purchases (exports `PurchasesService`; imports `StockModule`, `OutboxModule`)
- **Files:** `purchases.{module,service,controller}.ts`, `entities/{purchase,purchase-item}.entity.ts`, `dto/{create-purchase,reverse-purchase}.dto.ts`, `purchases.service.spec.ts`.
- **Entities:** `Purchase` (`purchases`) — billNo (`BILL-…`), supplier, totals, `paymentMethod`, reversal meta; `PurchaseItem` (`purchase_items`) — per-line `storeId`, qty/unitPrice, optional serials.
- **Service:** `create(dto,{skipOutbox?})` — stock IN per line, weighted-average roll-up `(oldQty·oldAvg + inQty·price)/newQty` onto `avgCost`/`costedQty`/`purchasePrice`, optional `registerStock` serials, journal Dr Inventory / Cr Cash|A_P, enqueue `PURCHASE_CREATED`; `reverse()` (idempotent, balancing journal + stock OUT PURCHASE_REVERSAL + decrement costedQty, leaves avgCost).
- **Controller:** `POST/GET /purchases`, `GET /purchases/:id`, `POST /purchases/:id/reverse`.

### purchase-orders (exports `PurchaseOrdersService`)
- **Files:** `purchase-orders.{module,service,controller}.ts`, `entities/{purchase-order,purchase-order-item}.entity.ts`, `dto/{create-purchase-order,update-status}.dto.ts`.
- **Entities:** `PurchaseOrder` (`purchase_orders`) — poNo (`PO-…`), status DRAFT/SENT/RECEIVED/CANCELLED, `orderDate`/`expectedDate` (string `'date'`); `PurchaseOrderItem` — `expectedUnitCost` (forecast only).
- **Service:** `create()` (rejects empty lines), `updateStatus()` (any→any, appends notes), `findAll(supplierId?,status?)`, `findOne`, `remove`. **No inventory/journal effect** — pure procurement doc; no auto-link to Purchase on RECEIVED.
- **Controller:** `POST/GET /purchase-orders`, `GET /:id`, `PATCH /:id/status`, `DELETE /:id`.

## Money

### accounts (`@Global`)
- **Files:** `accounts.{module,service,controller}.ts`, `entities/account.entity.ts`, `dto/{create,update}-account.dto.ts`.
- **Entities:** `Account` (`accounts`) — `type`/`accountCategory`/`accountSubType`, `parentAccountId` hierarchy, `isControl` (not postable), `isSystem`, `code` unique, `openingBalance`. **7 system accounts:** REVENUE 4100 / COGS 5100 / INVENTORY 1150 / A_R 1140 / DEFERRED_RECEIVABLE 1145 / A_P 2100 / CASH_ON_HAND 1110. **8 control nodes:** 1000 Assets, 1100 Current Assets, 1200 Fixed Assets, 2000 Liabilities, 3000 Equity, 4000 Revenue, 5000 COGS, 6000 Operating Expenses.
- **Service:** `onModuleInit` → backfillCodes/backfillCategories/seedControlAccounts/seedSystemAccounts (idempotent); `findSystem(type)` (cross-module hook); CRUD + auto-code + category derivation; system accounts can't be deleted.
- **Controller:** `POST/GET /accounts`, `GET/PATCH/DELETE /accounts/:id`.
- **Notable:** User-creatable types via API: CASH/BANK/WALLET/CAPITAL/CREDIT.

### payments (exports `PaymentsService`)
- **Files:** `payments.{module,service,controller}.ts`, `entities/payment.entity.ts`, `dto/{create-payment,reverse-payment}.dto.ts`.
- **Entities:** `Payment` (`payments`) — `direction` IN (RCT-…, customer) / OUT (PMT-…, supplier), account, amount, reversal meta.
- **Service:** `create()` posts voucher + balancing journal (IN: Dr Cash / Cr A_R, sourceModule RECEIPT; OUT: Dr A_P / Cr Cash, sourceModule PAYMENT) in a transaction; `reverse()` idempotent. No stock impact.
- **Controller:** `POST /payments`, `GET /payments?direction=`, `GET /:id`, `POST /:id/reverse`.
- **Notable:** IN requires customerId, OUT requires supplierId. (Sale-commitment settlement creates a Payment row directly inside `SalesService.settleCommitment`, not via this service.)

### fund-transfers (exports `FundTransfersService`, `TypeOrmModule`)
- **Files:** `fund-transfers.{module,service,controller}.ts`, `entities/fund-transfer.entity.ts`, `dto/{create-fund-transfer,reverse-fund-transfer}.dto.ts`.
- **Entities:** `FundTransfer` (`fund_transfers`) — between own accounts (`TRF-…`), `transferDate` string date, no stock impact.
- **Service:** `create()` symmetrical journal (Dr dest / Cr source, sourceModule FUND_TRANSFER), `reverse()` idempotent, `remove()` (hard); reporting helpers `accountDeltaAt/groupDeltaAt/deltaByAccount/findInvolvingAccounts` (exclude treasury moves from cash-flow + feed cash-register/balance-sheet).
- **Controller:** `POST/GET /fund-transfers`, `GET/DELETE /:id`, `POST /:id/reverse`.

### cash-register (exports `CashRegisterService`; imports `FundTransfersModule`)
- **Files:** `cash-register.{module,service,controller}.ts`, `entities/{cash-entry,cash-register-session}.entity.ts`, `dto/{create-cash-entry,open-session,close-session,wallet-transfer}.dto.ts` (`WalletTransferDto` unused).
- **Entities:** `CashEntry` (`cash_entries`) — pure cash movements (IN/OUT, 7 categories); `CashRegisterSession` (`cash_register_sessions`) — one per shop-day (unique `session_date`), open/close, `closingDenominations` JSON, opening/closing variance, `openingTransferId`.
- **Service:** entry CRUD; `openSession` (expected from prior-day close, optional atomic shortfall fund transfer), `closeSession` (denominations + variance, numeric-only, no journal), `getSession/sessionStatus/listSessions`, `varianceTrend(days)`, `dailyBook(date)` (parallel fan-out: session + cash entries + cash sales/purchases/payment vouchers + transfers + prior-day on-hand; MISC warning), `summary(from,to)`, private `cashOnHandAsOf`/`expectedClosingFor`.
- **Controller:** `POST/GET /cash-register`, `GET /cash-register/{day,summary,sessions,sessions/status,variance-trend}`, `POST /cash-register/sessions/{open,:date/close}`, `GET/DELETE /cash-register/:id`.
- **Notable:** Reconciliation/reporting only — open/close post no journal or stock. Inter-cash transfers excluded from the daily book.

## HR & incentives

### attendance (exports `AttendanceService` only)
- **Files:** `attendance.{module,service,controller}.ts`, `entities/attendance.entity.ts`, `dto/upsert-attendance.dto.ts`.
- **Entities:** `Attendance` (`attendance`) — `@Unique(employeeId, date)`, status PRESENT/ABSENT/HALF_DAY/LEAVE.
- **Service:** `upsert()` by key, `findAll`, `grid(from,to)` (flat rows for client matrix), `tally(employeeId,from,to)`, `remove`.
- **Controller:** `POST /attendance`, `GET /attendance?employeeId&from&to`, `GET /attendance/{grid,tally}`, `DELETE /:id`.

### employee-transactions (exports `EmployeeTransactionsService`, `TypeOrmModule`)
- **Files:** `employee-transactions.{module,service,controller}.ts`, `entities/employee-transaction.entity.ts`, `dto/create-employee-transaction.dto.ts`.
- **Entities:** `EmployeeTransaction` (`employee_transactions`) — type SALARY_ACCRUED/SALARY/ADVANCE/REIMBURSEMENT/EXPENSE/INCENTIVE_PAYOUT/ADJUSTMENT, optional `accountId`, per-type voucher prefix (SALA/SAL/ADV/RBT/EXP/INC/ADJ).
- **Service:** `create()` auto voucherNo per type (per-type sequence seed), `findAll(employeeId?,from?,to?)`, `findOne`, `remove`. No journal/outbox.
- **Controller:** `POST /employee-transactions`, `GET /employee-transactions?employeeId&from&to`, `GET/DELETE /:id`.
- **Notable:** Standalone ledger; double-entry/incentive-earned figures derived in Reports, not written here. SALARY_ACCRUED = Dr (we owe); payouts = Cr.

### employee-incentives (exports `EmployeeIncentivesService`, `TypeOrmModule`)
- **Files:** `employee-incentives.{module,service,controller}.ts`, `entities/employee-incentive-rule.entity.ts`, `dto/{create-rule,update-rule}.dto.ts`.
- **Entities:** `EmployeeIncentiveRule` (`employee_incentive_rules`) — `%` on basis ALL_SALES/CATEGORY/ITEM/BRAND slice (note: distinct `IncentiveBasis` union from the incentives module), `referenceId`, date window.
- **Service:** rule CRUD; `computeForPeriod(from,to,employeeId?)` — one row per (sale line × matching active rule), nets returns with negative rows, returns `{rows, byEmployee, total}`; `totalForPeriod`. Read-only derivation.
- **Controller:** `/employee-incentives/rules*`, `GET /employee-incentives/{compute,total}`.

### incentives (exports `IncentivesService`, `TypeOrmModule`)
- **Files:** `incentives.{module,service,controller}.ts`, `entities/{incentive-target,incentive-award}.entity.ts`, `dto/{create-incentive-target,update-incentive-target,create-incentive-award}.dto.ts`.
- **Entities:** `IncentiveTarget` (`incentive_targets`) — ITEM/BRAND qty target, `triggerThresholdPct` (default 80) unlocks per-unit credit; `IncentiveAward` (`incentive_awards`) — recorded payout.
- **Service:** target CRUD + `targetProgress/allTargetProgress`; `effectiveCostAdjustments()` (per-unit credit `incentiveAmount/targetQuantity` once threshold crossed — POS cost hint, biggest credit wins, **never snapshotted**); award CRUD + `awardsTotal` (consumed by Reports for adjusted net income). Pure read-derivation + plain CRUD.
- **Controller:** `/incentives/targets*` (+`/targets/progress`, `/targets/:id/progress`), `GET /incentives/cost-adjustments`, `/incentives/awards*` (+`/awards/total`).

## reports (read-only)
- **Files:** `reports.{module,service,controller}.ts`. Injects ~15 repos + `IncentivesService`, `FundTransfersService`, `EmployeeIncentivesService`.
- **Purpose:** Ledgers, financial statements, aging, analytics. Touches every business entity; **never writes** (don't add writes here).
- **Service:** Ledgers (operational/movement-derived) — `customerLedger`/`supplierLedger`/`accountLedger`/`employeeLedger` + `*Balances` batched + `stockLedger` (running balance, filterable by category/brand/supplier). Statements — `incomeStatement`, `balanceSheet`, `cashFlow`, `equityChanges` (operational), plus journal-derived `trialBalance`, `incomeStatementFromJournals`, `balanceSheetFromJournals` (via `balancesByCategory`). Aging — `arAging`/`apAging` + per-party `arAgingDetail`/`apAgingDetail` (buckets d0_30/d31_60/d61_90/d90, AR adds pastPromise overlay + `daysSinceFirstPastPromise`). Analytics — `itemMargins` (uses `costAtSaleTime`), `slowMovingStock`, `marginAnalytics` (by brand / lowest-margin / high-discount). ⚠️ `incomeStatement`/`balanceSheet` still approximate COGS/inventory via `item.purchasePrice` (documented stand-in), unlike `itemMargins`/`marginAnalytics` which use `costAtSaleTime`.
- **Controller:** GET-only, mirrors the service: `/reports/{customer,supplier,account,employee}-ledger/:id`, `/reports/{customer,supplier,account,employee}-balances`, `/reports/stock-ledger`, `/reports/{income-statement,balance-sheet,cash-flow,equity-changes}`, `/reports/{ar-aging,ap-aging}` (+`/:customerId`,`/:supplierId`), `/reports/{item-margins,slow-moving-stock,margin-analytics}`, `/reports/{trial-balance,income-statement-from-journals,balance-sheet-from-journals}`. Consumed by `Financials.js` + ledger pages.

---

# Frontend (erp-frontend/src)

### Shell & routing — App.js
- Provider nesting: `ThemeProvider → HashRouter → AuthProvider → Routes`; `Layout` gates auth before render (redirects to `/login`). HashRouter required for Electron `app://`.
- Outside Layout (no auth gate): `/login`; print routes `/print/{sale,purchase}/:id`, `/print/serial-label/:serial`, `/print/booking-receipt/:id`, `/print/box-tag/:id`.
- Inside Layout, top-level: `/` (Dashboard), `/pos`, `/cash-register`, `/master`, `/transactions`.
- Hub-wrapped (`HubFrame` tab strip): **Customer** (customers, receipts, customer-ledger[/:id], warranty-lookup, service-tickets) · **Sales** (sales-voucher, sales, sale-returns, deliveries, overdue-bookings) · **Supplier** (suppliers, brands, payments, incentives, supplier-ledger[/:id]) · **Purchase** (purchase-orders, purchases, purchase-returns) · **Item** (items, categories) · **Stock** (stores, stock, stock-ledger, stock-transfers, damaged-goods) · **Employee** (employees, attendance, employee-payments, employee-incentive-rules, employee-ledger[/:id]) · **Account** (accounts, fund-transfers, account-ledger[/:id]) · **Users** (users/users-allow-access/users-recent-login behind `RequireSuperuser`; users-change-password open) · **System** (backup open; audit-log/error-log behind `RequireSuperuser`). **Reports**: `/financials` — single route, no hub strip.
- **Auth:** `auth/AuthContext.js` (`useAuth`, token in `localStorage['hassan-auth-token']`, verifies via `/auth/me`, `isSuperuser`); `auth/RequireSuperuser.js` (only client-side RBAC; backend re-enforces).

### API client — src/api/client.js
- Base URL: `REACT_APP_API_BASE_URL` → `http://<hostname>:3001/api` → `localhost:3001` (empty-hostname fallback for Electron, else `new URL` throws).
- Module-level `authToken` seeded from localStorage; request interceptor adds `Authorization: Bearer`; 401 (with token) clears token+user and redirects to `#/login`.
- `getCached(path,{fresh,ttlMs})` — 10s in-memory cache + in-flight dedup for GETs; any non-GET invalidates the whole cache; errors expose `err.uiMessage`. `apiBaseUrl()` for native download URLs. `endpoints` map.

### Pages — src/pages/
Dashboard (14-call fetch, RevenueChart/StackedBar/Donut/FunnelStages widgets), Login (+ RequestAccess), MasterData (tile grid → entity panels), SalesVoucher (`POST /sales/voucher`, splits + deferred schedule), Sales/SaleReturns/Purchases/PurchaseReturns/PurchaseOrders, Receipts/Payments (VoucherPage wrappers IN/OUT), Stock, StockLedger, StockTransfers, DamagedGoods, {Customer,Supplier,Account}Ledger (LedgerView + AgingPanel), EmployeeLedger (own table), Attendance, EmployeePayments, EmployeeIncentiveRules, Incentives (targets/awards tabs), FundTransfers, CashRegister (Open/Close session + denomination modal + variance trend), POS (scan/cart, F2/F4/F8/F9 shortcuts, new-customer modal), Financials (5-tab reports), Backup (download/save/schedule/restore), AuditLog, ErrorLog, Transactions (tile gallery), WarrantyLookup (serial/invoice/customer/model modes), ServiceTickets, Deliveries, OverdueBookings (Release-to-Floor modal), print pages (InvoicePrint, SerialLabelPrint, BookingReceiptPrint, BoxTagPrint — all `window.print()` HTML, no thermal driver), and `pages/users/` (UsersInfo, UsersAllowAccess, UsersRecentLogin, UsersChangePassword).

### Components — src/components/
Layout (sidebar+topbar+outlet, rail toggle persisted, BackupReminder, LoginBell, UserChip/LogoutConfirm, GlobalSearch, SyncButton, ThemeToggle), HubFrame (tab strip, filters `superuserOnly`), CrudPage (generic table+form), VoucherPage (IN/OUT with running balance), LedgerView, AgingPanel, MiniCharts (StackedBar/Donut/Bullet/HorizontalBars/FunnelStages/MiniLine — hand-rolled SVG, no chart lib), ExportButtons (CSV/PDF via print), Brand (rail toggle + wordmark), Logo (transparent `<img>`, no chip), Icon (inline-SVG catalogue), ReverseAction (modal `POST {endpoint}/:id/reverse`), SyncButton (polls `/sync/status`, hidden when cloud unconfigured), GlobalSearch (lazy-loads parties/items, navigates to ledgers); `master/ItemsPanel.js` + `master/CategoriesPanel.js` (bespoke editors with domain-invariant logic).

### Hooks — src/hooks/
`useResource(path)` → `{ data, loading, error, reload, setData }` (cached GET on mount; `reload` always bypasses cache); `useUnsavedChangesPrompt(when)` (beforeunload + capture-phase click interception of hash-route links, since HashRouter has no `useBlocker`).

### Utils — src/utils/exporters.js
`exportCsv` (UTF-8 BOM for Excel) + `exportPdf` (opens a print window, auto-`window.print`); columns format `[{key,label,value?,align?}]`; `escapeCsv/escapeHtml/cellValue/todayStamp`.

### Nav & theme
`src/nav/hubs.js` — `HUBS` (10 hub defs: label/title/subtitle/icon/colorVar/defaultTo/paths/tabs) + flat `SIDEBAR` (13 entries: Dashboard, Cash Book, Customer, Sales, Supplier, Purchase, Item, Stock, Employee, Account, Users, Reports, System — **POS Terminal has no sidebar entry**, `/pos` reachable only by URL). `src/theme/ThemeContext.js` — light/dark via `data-theme` on `<html>`, persisted in `localStorage['hassan-theme']`, calls `window.erpBridge.setTitleBarTheme` in Electron.

### Styles — src/styles/ + src/App.css
`tokens.css` (flat Win10 CSS variables — nav colors, semantic, radius=0, Segoe UI / Cascadia fonts, light/dark blocks; loaded AFTER `App.css` so it wins on shared names; fixed Windows-blue `--primary`) + `app.css` (shell layout: sidebar/topbar/hub/grids/POS/charts/responsive drawer). `App.css` is legacy + domain rules (print styles, modal, login, badges, `-soft`/`-fg` semantic variants). `index.css` (single `code` font rule). `public/index.html` (CSP meta, loads `theme-bootstrap.js` before render; still references Google Fonts despite system-font direction — stale).

---

# Electron (erp-desktop/src)

### main.js
Single-instance lock (avoids `:3001` EADDRINUSE); `Menu.setApplicationMenu(null)`; registers privileged `app://` scheme serving the React build with SPA fallback to `index.html` — **never** `file://` (`location.origin === "null"` breaks React Router 7 / axios `new URL`); splash window while backend boots; spawns `erp-backend/dist/main.js` as a child via `ELECTRON_RUN_AS_NODE=1` with env `PORT=3001`, `SQLITE_PATH=<userData>/erp.sqlite`, `BACKUP_DIR=<userData>/backups`, `DB_MIGRATE_ON_BOOT='true'`, plus `CLOUD_SYNC_URL`/`DATABASE_URL`(+`DB_SSL`/`DB_SYNC`) from `<userData>/config.json` or env; logs to `<userData>/backend.log`; polls `/api/health` up to 5 min; `titleBarStyle:'hidden'` + `titleBarOverlay` repainted per theme via `erp:set-titlebar-theme` IPC; `sandbox:true` renderer. (No OS-accent-colour push — CLAUDE.md mentions it but it's not in this file.)

### preload.js
Context bridge exposing `window.erpBridge.setTitleBarTheme(theme)` over IPC (CSP-safe, no script injection).

### Supporting (erp-desktop/)
`package.json` — Electron pinned `^40` (better-sqlite3 prebuilt is electron-v145); `extraResources` from `backend-staging/` (not `../erp-backend/`); NSIS per-user installer, `deleteAppDataOnUninstall:false`. `scripts/prepare-resources.js` (the `prepackage` hook — builds backend+frontend, stages prod-only backend `node_modules`, `@electron/rebuild` better-sqlite3). `scripts/rebuild-native.js` (prebuild-install → @electron/rebuild fallback). `scripts/postinstall.js`. `build-resources/{icon.ico, installer.nsh, config.example.json}`.

---

# Scripts (scripts/)

`make-icons.ps1` — PowerShell + System.Drawing; chroma-keys `erp-frontend/logo.jpeg` near-black backdrop to alpha (C# `LogoProc.KeyOutBlack(24,72)` via LockBits for speed), emits `logo192/512/1024.png` + hand-built multi-res `favicon.ico` (16/24/32/48/64/128/256) into `erp-frontend/public/`, copies the ICO to `erp-desktop/build-resources/icon.ico`.

---

# Seeder — erp-backend/src/seed.ts

`npm run seed` (`SEED_SCALE=light|medium|heavy`, heavy default). Boots the app context (`createApplicationContext`, no HTTP/AuthGuard; forces local SQLite by blanking `DATABASE_URL`; deletes `CLOUD_SYNC_URL`), **detaches `AuditSubscriber`** (its fire-and-forget writes poison transactions under load → "no such savepoint"), and drives the real services (master data → items → purchases/stock → sales (bulk/voucher/POS) → payments → returns → tickets/deliveries → transfers/damaged/POs → attendance/emp-txns → incentives → cash register). `track()` wraps every write with retry/backoff on transient SQLite locks. In-memory `onHand`/`serialPool` ledgers prevent overselling. Single-writer: stop the dev server first.

---

# Tests — erp-backend

`cd erp-backend && npm test` (~14s; `npx jest --coverage` ~32s). **14 spec files, 157 passing tests** (the ERROR/WARN lines in output are intentional negative-path assertions). In-memory SQLite via `src/testing/test-db.ts` (`inMemoryTypeOrm(entities)`); no Supabase contact.

- **Spec files (14):** `app.controller`, `categories.service`, `items.service`, `journals/journal.service`, `periods/periods.service`, `pos.service`, `purchases.service`, `reports.service`, `sales.service`, `sequences/sequence.service`, `stock/stock.service`, `sync/hmac.util`, `sync/sync-signature.guard`, `sync/sync.service`.
- **Line coverage (real):** stock 100, sequence 100, sync-signature.guard 100, periods 97.7, hmac.util 96.4, journal 92.2, pos 83.8, categories 83.7, purchases 74, items 71.4, sales 69.8, reports 54.5, outbox 47.4, sync 44.9. Project-wide lines ~29%.
- **Untested (0% / thin):** accounts, attendance, audit-logs, backup, brands, cash-register, customers, damaged-goods, deliveries, employee-incentives, employee-transactions, employees, salary-accrual, error-logs, fund-transfers, incentives, item-serials, payments, purchase-orders, returns, service-tickets, stock-transfers, stores, suppliers, users, reauth, sqlite-checkpoint, app.service.

---

# Common / bootstrap (erp-backend/src)

- **`main.ts`** — scoped body-limits (100mb on `/api/backup/restore`, 256kb global), Helmet strict CSP, CORS allowlist (`app://localhost`, localhost dev, LAN regex), global `ValidationPipe` (whitelist+transform+forbidNonWhitelisted) + `ErrorLogFilter`, `setGlobalPrefix('api')`, `enableShutdownHooks()` (for WAL checkpoint), migrate-on-boot when `DB_MIGRATE_ON_BOOT=true`, listen on `PORT ?? 3001`.
- **`app.module.ts`** — `buildDbOptions()` dialect switch on `DATABASE_URL` (SQLite better-sqlite3 + unconditional synchronize, or Postgres with manually-parsed URL to dodge Supabase pooler username-splitting); wires all 36 imports + `AppController` + `SqliteCheckpointService`. (`AuthGuard` is registered in UsersModule, not here.)
- **`app.controller.ts`** — `GET /api/health` (`@Public`).
- **`data-source.ts`** — TypeORM CLI DataSource (`synchronize:false`, `typeorm_migrations` table) for `db:migrate*` scripts.
- **`common/entities/base.entity.ts`** — abstract `BaseEntity` (uuid `id`, `created_at`, `updated_at`). **`common/entities/setting.entity.ts`** — `Setting` (`settings`, key/value; backup schedule hour). **`common/delete-guard.ts`** — `deleteOrConflict(run,label)` → friendly 409 on FK violation. **`common/sqlite-checkpoint.service.ts`** — `beforeApplicationShutdown` `PRAGMA wal_checkpoint(TRUNCATE)` (SQLite only).
