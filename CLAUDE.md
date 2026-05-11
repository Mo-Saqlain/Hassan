# ERP System — Project Guide

Offline-first ERP for a small shop. Phase 1 covers core ERP (master data, sales/purchases, returns, payments, stock). Phase 2 adds a POS terminal with barcode scanning.

## Repo layout

```
erp-backend/    NestJS API + TypeORM + SQLite (Postgres-ready via DATABASE_URL)
erp-frontend/   Create React App + React Router + axios
erp-desktop/    Electron wrapper that bundles the backend + frontend offline
erp_phase_1_detailed_design_document.md   Phase 1 spec
```

## Run

Three terminals during dev:

```
cd erp-backend  && npm run start:dev   # http://localhost:3001/api
cd erp-frontend && npm start           # http://localhost:3000
cd erp-desktop  && npm run dev         # Electron window pointing at dev frontend
```

Production-style desktop build:
```
cd erp-backend  && npm run build
cd erp-frontend && npm run build
cd erp-desktop  && npm start
```

## Architecture

### Backend (NestJS)
- Module-per-domain under `erp-backend/src/modules/`. Each module owns its entities, DTOs, service, controller.
- TypeORM with `synchronize: true` on SQLite (dev/desktop) and Postgres (cloud) — no migrations yet.
- `OutboxModule` owns the local sync queue; sales/purchases/POS enqueue events when `CLOUD_SYNC_URL` is set.
- `SyncModule` has two halves:
  - **Receiver** (`POST /api/sync/push`): cloud-side. Applies events with idempotency by event ID.
  - **Worker** (`@Cron` every 30s): local-side. Posts pending outbox entries to `CLOUD_SYNC_URL`.
- DB switches between SQLite and Postgres based on the presence of `DATABASE_URL` (see `app.module.ts`).

### Frontend (React)
- HashRouter (works under Electron `file://`). `homepage: "./"` in `package.json`.
- Sidebar groups: Overview / Point of Sale / Setup / Transactions / Inventory.
- Master Data is a single page (`/master`) with a tile selector. Per-entity panels live in `src/components/master/`. **Do not add separate sidebar entries for new master-data entities — add them as tiles in `MasterData.js`.**
- API client at `src/api/client.js`. All responses surface `err.uiMessage` for display.
- POS page (`/pos`) drives the cashier flow: scan → cart → checkout → Sale.

### Electron
- `erp-desktop/src/main.js` spawns the compiled backend (`node dist/main.js`) as a child process, pointing `SQLITE_PATH` at Electron's `userData` dir. Polls `/api/health` then loads the React build.
- Kills the backend on quit.

## Domain model essentials

- **Items** have a unique `sku`, an optional unique `barcode`, optional `brand_id`, and a many-to-many with `categories`. Items can belong to any number of categories at any depth.
- **Categories** are self-referencing via `parent_id`. Tree is built client-side (`/categories/tree` returns it pre-built).
- **Sales / Purchases**: header + lines. Service wraps a TypeORM transaction that creates the voucher, lines, and matching `StockMovement` rows in one shot.
- **Stock**: append-only `stock_movements` ledger. On-hand is `SUM(CASE IN +q ELSE -q)`. OUT movements throw `BadRequestException` when on-hand would go negative.
- **Returns**: sale-return → stock IN; purchase-return → stock OUT.
- **Payments**: single table, `direction: 'IN' | 'OUT'`. IN = Receipt (RCT-…), OUT = Payment (PMT-…). Filter via `?direction=`.
- **POS Session**: a cashier session. `pos_cart_items` are session-scoped working state, cleared on checkout. Checkout calls `SalesService.create(..., { skipOutbox: true })` then enqueues a `POS_SALE_CREATED` outbox event itself (avoid double-enqueueing).

## Sync event types
- `SALE_CREATED`, `PURCHASE_CREATED` — Phase 1
- `POS_SALE_CREATED` — Phase 2, treated as `SALE_CREATED` on the cloud receiver (session metadata is stripped)
- `POS_SESSION_STARTED`, `POS_SESSION_CLOSED` — audit-only on cloud

## Conventions

- **TypeORM column casing**: snake_case column names via `name: 'foo_bar'`, camelCase entity fields. Do not change.
- **Auto-generated voucher numbers**: `INV-000001`, `BILL-000001`, `SR-000001`, `PR-000001`, `RCT-000001`, `PMT-000001`. Sequence is just `count + 1`. If you need gap-free guaranteed sequences later, swap for a `sequences` table.
- **Validation**: every Create/Update DTO uses class-validator decorators. The global `ValidationPipe` in `main.ts` has `whitelist`, `transform`, and `forbidNonWhitelisted` on — extra fields will throw.
- **No auth** in Phase 1/2. `userId` on `pos_sessions` is nullable and unwired. Don't bolt on JWT auth without checking with the user first.
- **Service-to-service deps**: `OutboxService` is the only thing both sales/purchases/POS and the sync push worker depend on. Don't recreate this by making `SalesModule` import `SyncModule` — that's circular.

## Common tasks

| Task | Where |
|---|---|
| Add a new master-data entity | Backend module under `src/modules/`, then a tile + panel in `erp-frontend/src/pages/MasterData.js`. Not a new sidebar route. |
| Add a transactional flow | Backend module + dedicated frontend page + sidebar entry in `Layout.js`. |
| Add a sync event type | Add to `SyncService.handleEvent` switch (cloud side) and call `outbox.enqueue()` at the local origin. |
| Change DB schema | Edit the entity; TypeORM `synchronize: true` will apply in dev. For Postgres production set `DB_SYNC=true` once or write a migration. |

## Don'ts

- Don't add separate sidebar links for master-data entities — they go in the Master Data tile grid (see `feedback_master_data_ui.md` in memory).
- Don't make `SalesModule` or `PurchasesModule` depend on `SyncModule` — use `OutboxModule` instead.
- Don't drop the local `erp.sqlite` file casually. It's in `.gitignore` but contains real session data when run locally.
- Don't switch the frontend back to BrowserRouter — HashRouter is required for the Electron `file://` build.
