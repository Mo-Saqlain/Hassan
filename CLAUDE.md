# Hassan Electronics ERP — Project Guide

Offline-first ERP + POS for a single home-appliances retail shop. The same NestJS codebase runs locally against SQLite (desktop install) and centrally against Supabase Postgres (cloud receiver). Outbox events flow from the local node to the cloud every 30 s when configured.

## Repo layout

```
erp-backend/    NestJS 11 + TypeORM 0.3. 30 modules, 41 entities. SQLite (better-sqlite3) by default; Postgres when DATABASE_URL is set.
erp-frontend/   React 19 + HashRouter + axios + light/dark themes. CRA build system.
erp-desktop/    Electron 40 wrapper. Spawns the compiled backend as a child process and loads the React build via file://.
scripts/        make-icons.ps1 — chroma-keys logo.jpeg and emits the favicon + Windows .ico.
README.md       User-and-dev-facing overview.
```

## Run

Two terminals during dev:

```
cd erp-backend  && npm run start:dev   # http://localhost:3001/api
cd erp-frontend && npm start           # http://localhost:3000
```

Optional Electron desktop wrapper (build both first):
```
cd erp-backend  && npm run build
cd erp-frontend && npm run build
cd erp-desktop  && npm start
```

Packaged installer:
```
cd erp-desktop && npm run package:win   # → release/Hassan Electronics ERP-Setup-1.0.0.exe
```

## Environment

`erp-backend/.env` (gitignored). Either set `DATABASE_URL` for Postgres/Supabase or leave it blank to fall back to SQLite.

```
DATABASE_URL=postgresql://postgres.<ref>:<password-url-encoded>@aws-1-<region>.pooler.supabase.com:5432/postgres
DB_SYNC=true     # auto-create schema on boot — Postgres only
DB_SSL=true
CLOUD_SYNC_URL=  # optional — local node pushes outbox here every 30 s
PORT=3001        # default
SQLITE_PATH=     # path to SQLite file when DATABASE_URL is unset; Electron forces <userData>/erp.sqlite
BACKUP_DIR=      # daily backups land here; Electron forces <userData>/backups
```

**Supabase gotchas:**
- Free-tier projects no longer accept direct IPv4 — use the **Session pooler** (`pooler.supabase.com:5432`), NOT the Direct connection or Transaction pooler on `:6543`. Transaction pooler breaks TypeORM's prepared statements.
- Pooler username is `postgres.<project-ref>`, not plain `postgres`.
- URL-encode special characters in the password (`@` → `%40`, etc.).

## Architecture

### Backend (NestJS)
- Module-per-domain under `erp-backend/src/modules/`. Each module owns its entities, DTOs, service, controller.
- TypeORM with `synchronize: true` on SQLite; gated by `DB_SYNC=true` on Postgres. No migrations yet — switch before treating Supabase as production.
- `OutboxModule` owns the local sync queue; `SalesService`/`PurchasesService`/`PosService` enqueue events when `CLOUD_SYNC_URL` is set.
- `SyncModule` has two halves:
  - **Receiver** (`POST /api/sync/push`): cloud-side. Applies events with idempotency by event ID.
  - **Worker** (`@Cron` every 30 s): local-side. Posts pending outbox entries to `CLOUD_SYNC_URL`.
- `ReportsModule` is read-only — it touches every business entity to compute ledgers + financials. Don't put writes there.
- `AuthGuard` is global (registered in `UsersModule`). Exempt routes: `/auth/login`, `/auth/request-access`, `/health`, `/sync/push`.

### Frontend (React)
- **HashRouter** (required so the build works under Electron `file://`). `homepage: "./"` in `package.json`.
- **API client** at `src/api/client.js` resolves the base URL in three layers: build-time `REACT_APP_API_BASE_URL`, then `http://<window.location.hostname>:3001/api`, then `localhost:3001` when hostname is empty (Electron `file://` case — required, otherwise URL constructor throws "Invalid URL").
- **Theming** lives in `src/theme/ThemeContext.js`. `data-theme="dark"|"light"` on `<html>` toggles CSS variables defined at the top of `tokens.css`. Theme bootstrap script in `public/index.html` applies the saved theme before React renders — no flash.
- **Layout** is responsive: desktop sidebar can be collapsed to a 56px rail; mobile turns it into an off-canvas drawer.
- **Hub pages** are the dominant pattern for grouped CRUD. Don't add new sidebar entries for sub-features — add a tab to the existing hub.

### Sidebar (`src/nav/hubs.js`)
14 entries, in order, each with its own colour token:
1. Dashboard · 2. POS Terminal · 3. Cash Book · 4. Customer (hub) · 5. Sales (hub) · 6. Supplier (hub) · 7. Purchase (hub) · 8. Item (hub) · 9. Stock (hub) · 10. Employee (hub) · 11. Account (hub) · 12. Users (hub) · 13. Reports · 14. System (hub).

### Electron
- `erp-desktop/src/main.js` spawns the compiled backend (`node dist/main.js` via `ELECTRON_RUN_AS_NODE=1`) as a child process, pointing `SQLITE_PATH` at Electron's `userData` dir and `BACKEND_PORT` at 3001. Polls `/api/health` then loads the React build.
- Reads `<userData>/config.json` on every launch for `cloudSyncUrl` and `databaseUrl` — the shop owner can wire the install to Supabase without rebuilding.
- Pushes the user's OS accent colour into the renderer via `did-finish-load` (Windows / macOS only); user override in `localStorage.hassan-accent-color` wins.
- **Custom `app://` protocol.** Main registers `app://` as privileged (standard / secure / supportFetchAPI) and a `protocol.handle('app', …)` callback serves files from the React build dir with an SPA fallback to `index.html`. The renderer is loaded via `app://localhost/index.html` — **not** `file://`. The native menu (File / Edit / View / …) is killed with `Menu.setApplicationMenu(null)`, the native title bar is hidden via `titleBarStyle: 'hidden'`, and `titleBarOverlay` keeps the Windows min/max/close controls drawn on the right at 44 px tall. The in-app `.topbar` is the drag region. A small `preload.js` exposes `window.erpBridge.setTitleBarTheme(theme)` over IPC so the overlay colours flip with the React theme.
- **Electron pinned to `^40`** because better-sqlite3 v12.10 only ships a prebuilt for `electron-v145` (= Electron 40). Bumping to 41+ either needs a new better-sqlite3 prebuilt or a working MSVC toolchain to compile from source.

> **Don't ever switch the renderer back to `file://`.** `file://` makes `window.location.origin` evaluate to the string `"null"` in Chromium. React Router 7 internals call `new URL(path, location.origin)`, which throws `Failed to construct 'URL': Invalid URL`. The `app://localhost` origin is the only thing keeping that quiet — any change that bypasses `mainWindow.loadURL('app://localhost/index.html')` (e.g. dropping back to `loadFile`) will resurrect the crash.

### Branding
- Source: `erp-frontend/logo.jpeg` (HE monogram, white H + blue E on black).
- `scripts/make-icons.ps1` chroma-keys out the black backdrop and emits transparent `logo192.png` / `logo512.png` / `logo1024.png` plus a multi-resolution `favicon.ico` (16/24/32/48/64/128/256) into `erp-frontend/public/`. The same ICO is copied to `erp-desktop/build-resources/icon.ico` for electron-builder.
- The transparent logo is rendered on the **Sign in** and **Request access** screens (no chip / backdrop). A theme toggle sits in the top-right of the login card. The logo is **not** rendered anywhere else in the app — only the wordmark.

## Domain model essentials

- **Items** — unique `sku` (auto-derived from Model No on collision), optional unique `barcode`, optional `brand_id`, M2M with `categories`. POS lookup matches barcode first, then SKU, then model no. Per-item flags: `tracksSerials`, `serialRequiredOnSale`, `hasWarranty`, `warrantyType`, `warrantyDays`, `isInternalGenerated`. Costing fields: `avgCost` (running weighted-average) + `costedQty` (denominator); `purchasePrice` kept only as a UI-default reference. `reservedQty` is the per-item overlay maintained by the Delivery + (eventually) Quotation modules.
- **Categories** — self-referencing via `parent_id`. Service prevents self-parenting and cycles. Optional `code` (≤ 8 uppercase chars, e.g. `COOLER`) used as the segment of auto-generated local serials (`LOCAL-<code>-<year>-<seq>`). App-layer uniqueness via `CategoriesService.ensureCodeUnique`.
- **ItemSerial** — one row per physical unit. Two orthogonal status fields: `status` (IN_STOCK / SOLD / RETURNED / DAMAGED / WRITE_OFF — physical lifecycle) and `allocationStatus` (AVAILABLE / BOOKED / DELIVERED — booking lifecycle). `isInternalGenerated` flags shop-minted local serials. Transitions live on `ItemSerialsService.bindToSale / reserveForBooking / releaseBooking / markDelivered / unbindFromInvoice / markReturned`. Warranty fields (`warrantyType`, `warrantyDays`, `warrantyEndAt`) freeze at sale time so editing the Item template later doesn't rewrite past sales.
- **Sales / Purchases** — header + lines. Service wraps a TypeORM transaction that creates the voucher, lines, and matching `StockMovement` rows atomically. Rollback on stock-insufficient. Sale carries `paymentCommitments` JSON (deferred-cash schedule), `amountPaidSettled`, and `costAtSaleTime` per line. Reversal posts a balancing journal entry, books inverse stock movements, and walks back allocationStatus (BOOKED→AVAILABLE for un-handed-over goods, DELIVERED→AVAILABLE + status=RETURNED for handed-over goods).
- **Stock** — append-only `stock_movements` ledger. On-hand = `SUM(IN +q vs OUT -q)`. OUT movements throw `BadRequestException` when on-hand would go negative.
- **Returns** — sale-return → stock IN (goods come back); purchase-return → stock OUT (goods leave).
- **Payments** — single table, `direction: 'IN' | 'OUT'`. IN = Receipt (RCT-…), OUT = Payment (PMT-…). Filter via `?direction=`. Settling a sale commitment via `POST /sales/:id/settle-commitment` posts a `direction='IN'` payment row + a journal half (Dr Cash / Cr Deferred Cash Receivables) and may flip BOOKED serials → DELIVERED when the balance hits zero.
- **POS Session** — a cashier session with running `salesTotal`/`salesCount`. `pos_cart_items` is session-scoped working state, cleared on checkout. Re-scanning the same item stacks the existing cart line. Checkout calls `SalesService.create(..., { skipOutbox: true })` then enqueues its own `POS_SALE_CREATED` outbox event. Branches on `dueAmount > 0`: full pay → `bindToSale` (DELIVERED), partial pay → `reserveForBooking` (BOOKED).
- **Deliveries** — operational tracking. Six statuses. `applyReservation` writes the `Item.reservedQty` overlay. `update()` enforces the **Strict Delivery Handover Authorisation** guard: rejects DELIVERED transition when the linked sale has `dueAmount > 0`.
- **Service tickets** — seven-status repair workflow. Optional `itemSerialId` link auto-pulls in-warranty status via the warranty endpoint.
- **Cash register sessions** — one per shop-day. Open + close use the denomination-counter modal (Rs 5000 / 1000 / 500 / 100 / 50 / 20 / 10). Closing JSON persisted as `closingDenominations`.
- **Fund transfers** — Capital ↔ Cash ↔ Bank ↔ Wallet ↔ Credit. Pure movement of own funds.
- **Accounts** — five user flavours (CASH, BANK, WALLET, CAPITAL, CREDIT) + 7 seeded system accounts (REVENUE 4100, COGS 5100, INVENTORY 1150, A_R 1140, **DEFERRED_RECEIVABLE 1145**, A_P 2100, CASH_ON_HAND 1110).
- **Incentive targets** — sell N units to unlock a per-unit incentive. `triggerThresholdPct` (default 80): once net-sold qty crosses this %, the per-unit credit (`incentiveAmount / targetQuantity`) is surfaced on POS as an effective-cost discount via `GET /incentives/cost-adjustments`. Brand-basis targets propagate to all items in the brand; biggest credit wins on stacking.
- **Reports** — `ReportsService` computes customer/supplier/employee/account ledgers (running balance), stock ledger (filterable by category/brand/supplier), four financial statements (income / balance sheet / cash flow / changes in equity), A/R + A/P aging with `maxDaysElapsed` + `oldestUnpaidDate` + (AR-only) `daysSinceFirstPastPromise`, per-invoice aging detail via `/reports/ar-aging/:customerId` and `/reports/ap-aging/:supplierId`, item margins (using snapshotted `costAtSaleTime`), slow-moving stock buckets, and margin analytics (by brand + low-margin + high-discount slices).

## Sync event types

- `SALE_CREATED`, `PURCHASE_CREATED` — Phase 1 transactions
- `POS_SALE_CREATED` — Phase 2 POS sale (treated as `SALE_CREATED` on the cloud receiver; session metadata stripped)
- `POS_SESSION_STARTED`, `POS_SESSION_CLOSED` — audit-only on cloud (no DB writes)

Booking-state transitions (BOOKED / DELIVERED flips) are NOT separately synced — the cloud derives allocation state from the same sale + serial rows that already flow through `SALE_CREATED`. Keep it that way unless multi-location reporting becomes a real requirement.

## Sync trigger model

Cloud push is **manual**, not scheduled. There is no `@Cron` on `SyncService.pushPending` — it runs only when:
- the user clicks the "Sync" button in the topbar (calls `POST /api/sync/flush`), or
- a server-side caller invokes `SyncService.pushPending()` directly (no current callers; reserved for future tooling).

`pushPending()` returns a `SyncRunSummary` (`{ ok, cloudConfigured, attempted, succeeded, failed, message, error? }`) so the UI can show a result toast. The `<SyncButton/>` in `Layout`:
- polls `GET /api/sync/status` every 30 s to keep the pending-count badge fresh
- hides itself entirely when `CLOUD_SYNC_URL` is unset (no point offering a button that always errors)
- shows a spinner while the request is in flight and a coloured pill (success / warn / error) with the summary message

Don't add a `@Cron` back unless the product direction explicitly changes — the user asked for manual sync precisely so a flaky network doesn't bury the till in retry traffic.

## Conventions

- **TypeORM column casing**: snake_case in DB via `name: 'foo_bar'`, camelCase entity fields. Don't change.
- **Dialect-portable date columns**: use `@Column({ type: Date, ... })` (the constructor), NOT `@Column({ type: 'timestamp' })`. The string `'timestamp'` is Postgres-only and crashes better-sqlite3 with `DataTypeNotSupportedError` on boot. `Date` resolves to `datetime` (SQLite) or `timestamp without time zone` (Postgres). The string `'datetime'` is SQLite-only and Postgres rejects it — same trap in reverse.
- **TypeORM orderBy gotcha**: use the camelCase property in `.orderBy('m.createdAt', ...)` — `.orderBy('m.created_at')` fails on some adapters with `Cannot read properties of undefined (reading 'databaseName')`.
- **Indexes** — every entity carries `@Index` decorators targeting the columns its services actually filter or sort on. 107 indexes across 41 entities. Adding a new query pattern? Add the matching `@Index` to the entity (composite for filter+sort).
- **Auto-generated voucher numbers**: `INV-000001`, `BILL-000001`, `SR-000001`, `PR-000001`, `RCT-000001`, `PMT-000001`, `TRF-000001`, `PO-000001`. Sequence is `count + 1` — not gap-free. Swap for a sequences table if you need strict sequencing.
- **Validation**: every Create/Update DTO uses class-validator decorators. The global `ValidationPipe` in `main.ts` has `whitelist`, `transform`, and `forbidNonWhitelisted` on — extra fields throw.
- **Auth**: opaque server-issued tokens (not JWT), 12-hour sliding window, sent as `Authorization: Bearer <token>`. The `AuthGuard` is global; mark public endpoints with `@Public()`.
- **Service-to-service deps**: `OutboxService` is the only thing both sales/purchases/POS and the sync push worker depend on. Don't recreate this by making `SalesModule` import `SyncModule` — that's circular.
- **Audit logging** is done by `AuditSubscriber` (a TypeORM `EntitySubscriber`), not DB triggers. Cross-DB safe.

## UI direction

- **Flat Windows 10** — no border-radius anywhere, no glass / blur / aurora / gradients on chrome, no transforms or hover animations. Solid surfaces with 1px borders. Lightweight `color` / `background` / `border` transitions only.
- **Segoe UI Variable** + Segoe UI fallback for text, **Cascadia Code** / Consolas for numbers / SKUs / refs. No web fonts — system stack only.
- **Sidebar icons** carry a tinted chip in each entry's own `--nav-c` token; active item paints a 3 px accent strip on the left edge.
- **HE logo** renders only on `/login` and `/request-access` (transparent, no chip backdrop — the user explicitly rejected the chip approach; see memory).

## Testing

Backend has 81 Jest tests under `src/modules/*/*.spec.ts` covering the high-value services:

```
cd erp-backend && npm test               # full suite (~6s)
cd erp-backend && npx jest --coverage    # coverage report
```

Tests use an in-memory SQLite TypeORM data source via `src/testing/test-db.ts` — they don't touch Supabase. Line coverage on the tested services: stock 100%, pos 96%, categories 93%, sales 91%, purchases 91%, items 90%, reports 88%, sync 59% (cron worker not exercised), outbox 75%.

Untested (intentional): `accounts`, `brands`, `customers`, `suppliers`, `stores`, `payments`, `returns` — thin CRUD wrappers identical in shape to `categories.service` (93% covered).

## Common tasks

| Task | Where |
|---|---|
| Add a master-data entity | Backend module under `src/modules/`, then a tab inside the appropriate hub in `nav/hubs.js`. **Not** a new sidebar entry. |
| Add a transactional flow | Backend module + a dedicated frontend page wired as a tab inside the relevant hub (Sales, Purchase, Employee, etc.). |
| Add a sync event type | Add to `SyncService.handleEvent` switch (cloud side) and call `outbox.enqueue()` at the local origin. |
| Add a new report | Add a method on `ReportsService`, a route in `ReportsController`, then consume it in `Financials.js` (new tab) or a new page. |
| Change DB schema | Edit the entity; TypeORM `synchronize: true` will apply in dev / SQLite. For Postgres production set `DB_SYNC=true` once or write a migration. |
| Update favicon / app icon | Replace `erp-frontend/logo.jpeg`, then run `scripts/make-icons.ps1` from the repo root. Regenerates PNGs + ICOs. |
| Build a desktop installer | `cd erp-desktop && npm run package:win` → `release/Hassan Electronics ERP-Setup-1.0.0.exe` (~115 MB, per-user NSIS, unsigned). |

## Don'ts

- Don't add separate sidebar entries for master-data entities — they go as tabs inside the Customer / Supplier / Item / Account / Stock / Employee hubs.
- Don't add separate sidebar entries for transaction types — they go as tabs inside the relevant hub (Sales History + Returns under Sales; Purchases + Returns under Purchase; etc.).
- Don't make `SalesModule` or `PurchasesModule` depend on `SyncModule` — use `OutboxModule` instead. Circular.
- Don't switch the renderer back to `file://` (`loadFile` / direct path) — the React Router 7 internals call `new URL(path, location.origin)`, and Chromium reports `"null"` for the origin under `file://`, which throws "Failed to construct 'URL': Invalid URL". Stay on `app://localhost/index.html`.
- Don't re-introduce the 30-second sync `@Cron`. The user asked for manual sync via the topbar button so unattended retries can't burn through cellular data on a flaky link.
- Don't bring back the native menu bar (File / Edit / View). `Menu.setApplicationMenu(null)` is intentional; the topbar carries the brand + actions.
- Don't put writes in `ReportsService` — it's read-only.
- Don't bring back the manual "+ New Sale" form on the Sales page — sales are POS-driven; that page is read-only history.
- Don't use `@Column({ type: 'timestamp' })` or `@Column({ type: 'datetime' })` — both crash one of the two supported dialects. Use `@Column({ type: Date })`.
- Don't render the HE logo with a black chip / coloured backdrop anywhere. Transparent only.
- Don't bump Electron past `^40` unless better-sqlite3 publishes a prebuilt for the new ABI, or the build host has MSVC Build Tools installed.
- Don't introduce DB triggers or stored procedures. Use TypeORM `EntitySubscriber` for cross-cutting concerns (already done for audit logs).
- Don't use `Item.purchasePrice` as COGS basis anywhere. It's a UI-default-only reference now — `SaleItem.costAtSaleTime` (a snapshot of `Item.avgCost` at sale time) is the source of truth for COGS, gross profit, and margin reports. Touching `purchasePrice` for any accounting derivation reintroduces the historical-margin-shift bug we explicitly fixed.
- Don't collapse `status` and `allocationStatus` on `ItemSerial` into a single column. The synthesizer evaluated it — they're orthogonal axes (physical condition vs allocation lifecycle). A unit can be DAMAGED + BOOKED simultaneously.
- Don't auto-refund a customer's advance when releasing a stuck booking via `/sales/:id/release-booking`. The advance stays as customer credit; the owner refunds manually via a Receipt-reversal when they choose. Auto-refund would silently destroy money the owner may want to keep against future purchases.
- Don't gate the DELIVERED transition on anything other than `Sale.dueAmount > 0` in `DeliveriesService.update()`. That single check is the entire Strict Delivery Handover Authorisation. Adding more conditions (e.g. "must have receipt voucher", "must be after X days") creates failure modes that block legitimate handovers.
- Don't add a separate sidebar entry for Overdue Bookings or Service Tickets. They go as tabs inside Sales / Customer respectively — that's the existing hub convention.
- Don't seed the `Deferred Cash Receivables (1145)` account from a migration. It seeds on every boot via `AccountsService.onModuleInit` alongside the other system accounts, idempotently. Adding a one-off migration just creates schema drift between local SQLite and Supabase.
- Don't compute incentive credits at sale time and freeze them onto the SaleItem. `GET /incentives/cost-adjustments` recomputes from current target state — the credit is a UI hint, not an accounting figure. Snapshotting would require an "incentive credit reversal" path on sale reversal which is more complexity than the feature is worth.
