# Hassan Electronics ERP — Project Guide

Offline-first ERP + POS for a home-appliances shop ("Hassan Electronics"). Phase 1 covers core ERP (master data, transactions, stock, payments). Phase 2 adds a POS terminal with barcode scanning, customer/supplier ledgers, stock ledger, and four financial statements.

## Repo layout

```
erp-backend/    NestJS API + TypeORM (Postgres via Supabase by default, SQLite fallback)
erp-frontend/   Create React App + React Router + axios + light/dark themes
erp-desktop/    Electron wrapper that bundles the backend + frontend offline
erp_phase_1_detailed_design_document.md   Original spec
README.md       Functional + technical overview
.gitignore      Excludes node_modules, .env, *.sqlite, build/, dist/, etc.
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

## Environment

`erp-backend/.env` (gitignored). Either set `DATABASE_URL` for Postgres/Supabase or leave it blank to fall back to SQLite.

```
DATABASE_URL=postgresql://postgres.<ref>:<password-url-encoded>@aws-1-<region>.pooler.supabase.com:5432/postgres
DB_SYNC=true     # auto-create tables on boot (turn off in production)
DB_SSL=true
CLOUD_SYNC_URL=  # optional — points local node at cloud /api/sync/push
```

**Supabase gotchas:**
- Free-tier projects no longer accept direct IPv4 connections — use the **Session pooler** (`pooler.supabase.com:5432`), NOT the Direct connection or Transaction pooler on `:6543`. Transaction pooler breaks TypeORM's prepared statements.
- The pooler username is `postgres.<project-ref>`, not plain `postgres`.
- Special characters in the password must be URL-encoded (`@` → `%40`, etc.).

## Architecture

### Backend (NestJS)
- Module-per-domain under `erp-backend/src/modules/`. Each module owns its entities, DTOs, service, controller.
- TypeORM with `synchronize: true` while iterating; no migrations yet. Switch to migrations before treating Supabase as production.
- `OutboxModule` owns the local sync queue; `SalesService`/`PurchasesService`/`PosService` enqueue events when `CLOUD_SYNC_URL` is set.
- `SyncModule` has two halves:
  - **Receiver** (`POST /api/sync/push`): cloud-side. Applies events with idempotency by event ID.
  - **Worker** (`@Cron` every 30s): local-side. Posts pending outbox entries to `CLOUD_SYNC_URL`.
- `ReportsModule` is read-only — it touches everyone's entities to compute ledgers + financials. Don't put writes there.

### Frontend (React)
- **HashRouter** (required so the build works under Electron `file://`). `homepage: "./"` in `package.json`.
- **API client** at `src/api/client.js` resolves the base URL from `window.location.hostname` so visiting from a phone at `http://192.168.x.x:3000` auto-targets `http://192.168.x.x:3001` instead of the phone's own localhost.
- **Theming** lives in `src/theme/ThemeContext.js`. `data-theme="dark"` / `"light"` on `<html>` toggles CSS variables defined at the top of `App.css`. Theme bootstrap script in `public/index.html` applies the saved theme before React renders, avoiding flash.
- **Layout** is responsive: desktop sidebar can be collapsed to a 72px rail; mobile turns it into an off-canvas drawer with a hamburger and backdrop.
- **Hub pages** are the dominant pattern for grouped CRUD. Don't add new sidebar links for sub-features — they go in the appropriate hub:
  - `/master` (Master Data) — Items, Categories, Brands, Customers, Suppliers, Stores, Bank/Wallet
  - `/transactions` (Transactions) — Sales History, Sale Returns, Purchases, Purchase Returns, Receipts, Payments

### Electron
- `erp-desktop/src/main.js` spawns the compiled backend (`node dist/main.js`) as a child process, pointing `SQLITE_PATH` at Electron's `userData` dir for true offline-first. Polls `/api/health` then loads the React build.
- Kills the backend on quit.

## Domain model essentials

- **Items** — unique `sku`, optional unique `barcode`, optional `brand_id`, many-to-many with `categories`. POS lookup matches barcode first, then SKU.
- **Categories** — self-referencing via `parent_id`. Service prevents self-parenting and cycles (`/categories/tree` returns it pre-built).
- **Sales / Purchases** — header + lines. Service wraps a TypeORM transaction that creates the voucher, lines, and matching `StockMovement` rows atomically. Rollback on stock-insufficient.
- **Stock** — append-only `stock_movements` ledger. On-hand = `SUM(IN +q vs OUT -q)`. OUT movements throw `BadRequestException` when on-hand would go negative.
- **Returns** — sale-return → stock IN (goods come back); purchase-return → stock OUT (goods leave).
- **Payments** — single table, `direction: 'IN' | 'OUT'`. IN = Receipt (RCT-…), OUT = Payment (PMT-…). Filter via `?direction=`.
- **POS Session** — a cashier session with running `salesTotal`/`salesCount`. `pos_cart_items` is session-scoped working state, cleared on checkout. Re-scanning the same item stacks the existing cart line. Checkout calls `SalesService.create(..., { skipOutbox: true })` then enqueues its own `POS_SALE_CREATED` outbox event.
- **Reports** — `ReportsService` computes customer/supplier ledgers (running balance), stock ledger (filterable by category/brand/supplier), and four financial statements (income / balance sheet / cash flow / changes in equity). The balance sheet uses an `asOf` filter passed through to `customerLedger`/`supplierLedger`.

## Sync event types
- `SALE_CREATED`, `PURCHASE_CREATED` — Phase 1
- `POS_SALE_CREATED` — Phase 2; treated as `SALE_CREATED` on the cloud receiver (session metadata is stripped before persist)
- `POS_SESSION_STARTED`, `POS_SESSION_CLOSED` — audit-only on cloud (no DB writes)

## Conventions

- **TypeORM column casing**: snake_case column names via `name: 'foo_bar'`, camelCase entity fields. Don't change.
- **TypeORM orderBy gotcha**: use the camelCase property in `.orderBy('m.createdAt', ...)` — `.orderBy('m.created_at')` fails on some adapters with `Cannot read properties of undefined (reading 'databaseName')`.
- **Auto-generated voucher numbers**: `INV-000001`, `BILL-000001`, `SR-000001`, `PR-000001`, `RCT-000001`, `PMT-000001`. Sequence is `count + 1` — not gap-free. Swap for a sequences table if you need strict sequencing.
- **Validation**: every Create/Update DTO uses class-validator decorators. The global `ValidationPipe` in `main.ts` has `whitelist`, `transform`, and `forbidNonWhitelisted` on — extra fields will throw.
- **No auth** in Phase 1/2. `userId` on `pos_sessions` is nullable and unwired. Don't bolt on JWT auth without checking with the user first.
- **Service-to-service deps**: `OutboxService` is the only thing both sales/purchases/POS and the sync push worker depend on. Don't recreate this by making `SalesModule` import `SyncModule` — that's circular.

## Testing

Backend has 74 Jest tests under `src/modules/*/*.spec.ts` covering the high-value services:

```
cd erp-backend && npm test               # full suite (~6s)
cd erp-backend && npx jest --coverage    # coverage report
```

Tests use an in-memory SQLite TypeORM data source via `src/testing/test-db.ts` — they don't touch Supabase. Line coverage on the tested services: stock 100%, pos 96%, categories 93%, sales 91%, purchases 91%, items 90%, reports 88%, sync 59% (cron worker not exercised), outbox 75%.

Untested (intentional): `accounts`, `brands`, `customers`, `suppliers`, `stores`, `payments`, `returns` — thin CRUD wrappers identical in shape to `categories.service` (93% covered).

## Common tasks

| Task | Where |
|---|---|
| Add a new master-data entity | Backend module under `src/modules/`, then a tile + panel in `erp-frontend/src/pages/MasterData.js`. **Not** a new sidebar route. |
| Add a transactional flow | Backend module + dedicated frontend page. Wire it as a tile inside `Transactions.js`, **not** a new sidebar entry. |
| Add a sync event type | Add to `SyncService.handleEvent` switch (cloud side) and call `outbox.enqueue()` at the local origin. |
| Add a new report | Add a method on `ReportsService`, a route in `ReportsController`, and consume it in `Financials.js` (new tab) or a new page. |
| Change DB schema | Edit the entity; TypeORM `synchronize: true` will apply in dev. For Postgres production write a migration. |
| Wipe all data | The one-shot `wipe-data.js` script was deleted after use — rewrite if needed: TRUNCATE all 22 business tables with RESTART IDENTITY CASCADE. |

## Don'ts

- Don't add separate sidebar links for master-data entities — they go in the Master Data tile grid (see `feedback_master_data_ui.md` in memory).
- Don't add separate sidebar links for transaction types — they go in the Transactions hub tile grid.
- Don't make `SalesModule` or `PurchasesModule` depend on `SyncModule` — use `OutboxModule` instead.
- Don't switch the frontend back to BrowserRouter — HashRouter is required for the Electron `file://` build.
- Don't put writes in `ReportsService` — it's read-only.
- Don't bring back the manual "+ New Sale" form on the Sales page — sales are POS-driven now; that page is read-only history.
