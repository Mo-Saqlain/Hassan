# Hassan Electronics — Home-Appliances ERP & POS

Offline-first ERP with an integrated Point-of-Sale terminal for a single home-appliances retail shop. Inventory, master data, vouchers, customer / supplier / account ledgers, a daily cash register with session-based opening, fund transfers between owner accounts (Capital ↔ Cash ↔ Bank ↔ Wallet ↔ Credit), an incentive-tracking system that feeds adjusted-net-income, daily JSON backups with restore, the four standard financial statements, and access control with a single superuser who approves new users. The same backend codebase runs locally against SQLite (desktop install) or against Supabase Postgres in the cloud. Designed to keep selling even when the internet is down — sales queue up locally and sync to the cloud when connectivity returns.

![Status](https://img.shields.io/badge/status-Phase%201%20%2B%202%20%2B%203%20complete-brightgreen)
![Tests](https://img.shields.io/badge/tests-142%20Jest%20specs-success)
![Backend](https://img.shields.io/badge/backend-NestJS%2011%20%2B%20TypeORM-e0234e)
![Frontend](https://img.shields.io/badge/frontend-React%2019%20%2B%20HashRouter-61dafb)
![Desktop](https://img.shields.io/badge/desktop-Electron%2040%20%2B%20NSIS-47848f)
![Theme](https://img.shields.io/badge/themes-light%20%2B%20dark-0078d4)

---

## Table of Contents

1. [What this is](#what-this-is)
2. [Functional features](#functional-features)
3. [Technical stack](#technical-stack)
4. [Architecture](#architecture)
5. [Repo layout](#repo-layout)
6. [Setup & run](#setup--run)
7. [Environment variables](#environment-variables)
8. [Mobile / LAN access](#mobile--lan-access)
9. [Desktop installer (Electron)](#desktop-installer-electron)
10. [Backups](#backups)
11. [Testing](#testing)
12. [Project conventions](#project-conventions)

---

## What this is

A retail ERP for a single-store shop selling home appliances. The cashier rings up sales through a barcode / model-no driven POS terminal. The same database tracks purchases from suppliers, stock movements, customer credit, supplier dues, employee payroll + incentives, and produces the four standard financial statements.

Everything is **offline-first**: the cashier can keep selling when the internet is down. Sales, purchases, payments, stock movements, and POS sessions queue up locally in an outbox table and sync to the cloud when connectivity returns.

The UI follows a deliberate **flat Windows 10** direction — Segoe UI system fonts, sharp 90° corners (no border-radius), 1px borders, solid surfaces, no glass / blur / aurora / animation. Built for low-end shop PCs while still feeling modern.

---

## Functional features

### 1. Point of Sale (POS)
- **Model-number scan** — single auto-focused input. Backend matches barcode first, then SKU, then model-no. UI placeholder reads *"Type model no. — e.g. DAWLANCE LVS-15"*.
- **Cart with re-scan stacking** — scanning the same item again increments the existing line.
- **Inline quantity** +/− buttons, line remove, clear cart.
- **Payment methods**: Cash, Card, Bank, Credit.
- **Receiving account picker** — on every CASH / CARD / BANK sale the cashier picks which cash drawer / bank / wallet account is being credited. Picker is filtered to `CASH` accounts for cash sales and to `BANK + WALLET` for card / bank transfers. The sale's paid amount flows through `/reports/account-ledger/:id`, the Balance Sheet, and the Cash Flow statement against the chosen account — so a Rs 50,000 card-tap sale credits the correct HBL account, not a generic "cash" bucket. CREDIT sales don't ask for an account (nothing is collected yet).
- **Partial payment** — paid amount can be less than net; the remainder becomes a customer receivable. Selecting a customer is required for partial pay and for CREDIT sales (frontend + backend enforce this).
- **Customer credit limit** — every Customer carries `creditEnabled` (master switch, default off) and `creditLimit` (rupee ceiling). Any sale that would leave `dueAmount > 0` for a customer is rejected by `SalesService.create()` if (a) the customer has `creditEnabled === false`, or (b) the projected outstanding (current A/R + this sale's due) would exceed `creditLimit`. Walk-in / no-customer sales are exempt. Current outstanding is computed the same way the customer ledger computes balance: `openingBalance + sum(sale.dueAmount) − sum(receipts)`.
- **Change due** — when paid > net, the row reads `Change · …`.
- **In-flow customer create** — `+` next to the customer dropdown opens a modal that saves and auto-selects on close.
- **Session lifecycle** — Start session → ring up sales → Close session. Running `salesTotal` and `salesCount` displayed.
- **Receipt printing** — every checkout shows a Print receipt link that opens a print-friendly route and auto-fires the browser's print dialog.

### 2. Master data (hubs)
Master data lives inside the operational hubs in the sidebar, not in a separate "Catalogue" screen. Each hub renders its sub-entities as a horizontal tab strip:

| Hub | Tabs |
|---|---|
| Customer | Info · Receipts · Ledger |
| Sales | History · Returns |
| Supplier | Info · Brands · Payments · Incentives · Ledger |
| Purchase | Orders · Bills · Returns |
| Item | Catalogue · Categories |
| Stock | Summary · Stores · Ledger · Transfers · Damaged |
| Employee | Info · Attendance · Payments · Incentive Rules · Ledger |
| Account | Info · Transfers · Ledger |
| Users (admin) | Info · Allow Access · Recent Login · Change Password |
| System | Backups · Audit · Errors · Accent |

**Item identifier:** Model No is the primary identifier (used as the item's display name). SKU auto-derives from Model No on save (suffixed `-2`, `-3` … on collision). Barcode is optional. **Quick search** at the top of every list filters as you type (`searchKeys={[...]}` per page).

**Accounts:** five user-facing flavours — **Cash**, **Bank**, **Wallet** (Easypaisa / JazzCash), **Capital** (owner's equity), **Credit** (credit card or credit line — shows as a liability on the balance sheet when negative). Plus six **system accounts** seeded on first boot for the double-entry journal (`Sales Revenue`, `Cost of Goods Sold`, `Inventory`, `Accounts Receivable`, `Accounts Payable`, `Cash on Hand` — the last is a fallback for cash receipts without an explicit account picker). System accounts can be renamed but not deleted.

### 3. Transactions
- **POS sales** generate invoices (`INV-…`) with stock OUT
- **Sale returns** (`SR-…`) — goods back from customers, stock IN
- **Purchases** (`BILL-…`) — stock IN from suppliers; in-flow `+ New` button to create items mid-purchase
- **Purchase returns** (`PR-…`) — goods returned to suppliers, stock OUT
- **Receipts** (`RCT-…`) — money in from customers
- **Payments** (`PMT-…`) — money out to suppliers
- **Fund transfers** (`TRF-…`) — move money between your own accounts (Capital → Cash, Cash → Bank, Bank → Credit, etc.)
- **Purchase orders** (`PO-…`) — Draft → Sent → Received workflow

All voucher numbers are auto-generated `<PREFIX>-NNNNNN` based on row count + 1.

### 4. Inventory
- **Stock Summary** — every item's current on-hand vs minimum, Low/OK status, quick-search.
- **Stock Ledger** — every IN / OUT movement, filterable by item / category / brand / supplier / date range, with running balance per row.
- **Reason-driven manual adjustment** — `POST /api/stock/adjust`. The frontend never asks the user to pick "IN" or "OUT" directly; they pick a **reason** (`Loss / stolen`, `Damaged`, `Found`, `Stock count — was over / under`, `Correction +/−`) and the direction follows. Form shows current on-hand and the projected new on-hand, blocks submission if the adjustment would drive stock negative.
- **Damaged goods** register — DAMAGED / IN_REPAIR / WRITE_OFF / REPAIRED workflow. DAMAGED books an immediate stock OUT; REPAIRED books a reversing IN so items rejoin sellable inventory.

### 5. Ledgers
- **Customer Ledger** — chronological sale / sale-return / payment-at-sale / receipt rows with Debit / Credit / running Balance. Positive balance = customer owes us.
- **Supplier Ledger** — purchase / purchase-return / payment rows.
- **Employee Ledger** — salary accruals / payments / advances / reimbursements / earned incentives, with running balance. Positive balance = we owe the employee.
- **Account Ledger** — every cash / bank / wallet movement (sales paid, payments out, fund transfers, cash-book entries) against one specific account, asOf-filtered.
- **All-balances pages** — single GROUP-BY query that returns the closing balance for every customer / supplier / employee at once (avoids N+1 over per-row ledgers).

### 6. Cash Register
A real cashier's day book.
- **One session per shop-day** — opened with an `actualOpening` count. The opening flow optionally books a Capital → Cash `FundTransfer` atomically to cover any shortfall.
- **Cash-book entries** — small expenses, wallet top-ups, miscellaneous in / out. Blocked client-side once the session is CLOSED.
- **Daily closing** — counts the till, records `actualClosing`, calculates the variance vs the expected closing.

### 7. Incentives & Adjusted Profit
- **Supplier / brand incentive targets** — sell N units of an item or brand between dates to unlock a bonus. The shop sometimes sells at a per-unit loss because clearing the target unlocks an incentive that exceeds the loss — so true profit must include incentives.
- **Awards** — booked when the target is achieved and the supplier pays out. The Income Statement adds the sum of awards in the period to net income to produce **Adjusted Net Income**.
- **Employee incentive rules** — a percentage of base amount per matching sale (basis ITEM or BRAND, optional date range). Earned incentives flow into the employee ledger.

### 8. Reports — four financial statements + ledgers + aging + profitability
- **Income Statement** — Revenue → COGS → Gross Profit → Operating Expenses → Net Income → Incentive Awards → Adjusted Net Income.
- **Balance Sheet** — Assets (cash, bank, wallet, A/R) | Liabilities (A/P, credit lines) + Equity (Capital − Drawings + Retained Earnings). `asOf` filterable.
- **Cash Flow Statement** — operating + investing-style cash movement, including fund transfer deltas per account.
- **Statement of Changes in Equity** — Opening + Adjusted Net Income − Drawings = Closing.
- **Stock Ledger** with category / brand / supplier filters.
- **A/R aging** (`GET /reports/ar-aging?asOf=…`) — for every customer with an outstanding balance, residual amounts bucketed 0-30 / 31-60 / 61-90 / 90+ days. Receipts are consumed FIFO against the oldest unpaid sale; opening balance is treated as oldest and consumed first.
- **A/P aging** (`GET /reports/ap-aging?asOf=…`) — symmetric for suppliers: unpaid purchases minus payments-out, bucketed by age.
- **Item profitability** (`GET /reports/item-margins?from=…&to=…`) — qty sold, revenue, COGS (using current `item.purchasePrice` as the cost basis), gross profit, margin %, sortable by gross profit. Sale returns are netted out of qty and revenue. The "current purchase price as cost basis" simplification is replaced with a true weighted-average cost when the planned journal refactor introduces per-batch inventory cost tracking.

### 9. Cloud sync (offline-first, manual trigger, HMAC-signed)
- Every business transaction at the local node enqueues an event in the `sync_queue` outbox table (`SALE_CREATED`, `PURCHASE_CREATED`, `POS_SALE_CREATED`, `POS_SESSION_STARTED`, `POS_SESSION_CLOSED`).
- **Sync is manual, not scheduled.** A "Sync" button in the topbar shows the pending count as a badge, spins while the request is in flight, and toasts the result ("Synced 3 events.", "Nothing to sync.", or the error message from the cloud). Clicking it calls `POST /api/sync/flush`, which drains up to 50 pending entries and returns a `{ ok, cloudConfigured, attempted, succeeded, failed, message }` summary. The button hides itself entirely when `CLOUD_SYNC_URL` is not configured.
- The cloud receiver (`POST /api/sync/push`) is **another instance of this same NestJS backend** deployed against Supabase Postgres. It applies events with idempotency by event ID — duplicate event IDs return `DUPLICATE`, never re-applied. So Supabase is always eventually-consistent with what the shop did, with no special online-mode in the cashier UI.
- **HMAC-SHA256 request signing.** The receiver is public on the internet, so unsigned pushes would let anyone forge `SALE_CREATED` events. Each shop is provisioned with `SHOP_ID` + `SHOP_SYNC_SECRET` (32-byte random hex). The local node computes `HMAC-SHA256(secret, "<RFC3339 timestamp>\n<JSON body>")` and sends `X-Shop-Id`, `X-Sync-Timestamp`, `X-Sync-Signature` headers. The cloud receiver rejects with `401` if: any header is missing, the shop id doesn't match, the timestamp is more than 5 minutes off server time (replay window), or the signature doesn't recompute (constant-time compared). Event-ID idempotency is layered on top — even a signed request with a known event ID returns `DUPLICATE`. The local node refuses to push if the env vars are unset (no silent unsigned fallback).

### 10. Backups
- **Snapshot every business table** to a single JSON file on local disk. Backed-up tables: every entity except the user tables (`users`, `user_access_requests`, `user_login_events`) — those are intentionally excluded so a backup never leaks credentials.
- **Manual snapshot** — `System → Backups → Save backup now` writes a snapshot to disk; `Download snapshot` streams an in-memory snapshot to the browser as a download (no file persisted server-side — useful for USB-stick copies).
- **Restore from JSON** — `POST /backup/restore` accepts a multi-megabyte JSON body (Express body limit bumped to 100 MB in `main.ts` for this).
- **Scheduled daily snapshot** — `@Cron` runs hourly and snapshots if the configured hour has passed and no backup exists for today (default 20:00).
- **Storage** — defaults to `erp-backend/backups/` in dev; Electron forces `<userData>/backups`. Tracked in a `backups` table with file path, size, and trigger (AUTO / MANUAL).

### 11. Access control
- **Two roles** — `SUPERUSER` (admin) and `USER`. Seeded admin: `admin` / `Tech@123` on first boot.
- **Passwords** — scrypt hashes (`scrypt:saltHex:hashHex`), never plaintext.
- **Sessions** — opaque server-issued tokens (not JWT), 12-hour sliding window, sent as `Authorization: Bearer <token>`.
- **AuthGuard** is global. Exempt routes: `/auth/login`, `/auth/request-access`, `/health`, `/sync/push` (cloud webhook).
- **Request access flow** — the login page has a "Request access" button. Non-users can submit a `UserAccessRequest`; a SUPERUSER reviews and approves (assigning username + password) or rejects from `Users → Allow Access`.
- **Login events** — every successful login appends a `UserLoginEvent`. Surfaced under `Users → Recent Login` (superuser-only).
- **Entity-change audit log** — `AuditSubscriber` (a TypeORM `EntitySubscriber`, not a DB trigger — cross-dialect safe) logs every INSERT / UPDATE / DELETE on the business tables to `audit_logs` with the user, entity type, primary key, and a JSON diff of the fields that changed on UPDATE. Surfaced under `System → Audit`.
- **User tables are excluded from backups** so a snapshot never leaks credentials.

### 12. Double-entry journal & period locking
- **Journal entries** — every sale, purchase, receipt, payment, and fund transfer posts a balanced `JournalEntry` (header) with two-or-more `JournalLine` rows through `JournalService.post()` in the same TypeORM transaction as the source row. The service rejects unbalanced entries (`SUM(debit) !== SUM(credit)`) and single-sided lines. Entry numbers come from the global `SequenceService` as `JE-NNNNNN`.
- **Posting maps**
  - **Sale** (`INV-…`): Dr Cash/Bank (or `Cash on Hand` fallback) for `paidAmount`, Dr `A/R` for `dueAmount`, Cr `Sales Revenue` for `netAmount`, plus Dr `COGS` / Cr `Inventory` for `qty × item.purchasePrice`.
  - **Purchase** (`BILL-…`): Dr `Inventory` for `netAmount`; Cr `Cash on Hand` for `paidAmount`, Cr `A/P` for `dueAmount`.
  - **Receipt** (`RCT-…`): Dr account or `Cash on Hand` fallback / Cr `A/R`.
  - **Payment** (`PMT-…`): Dr `A/P` / Cr account or `Cash on Hand` fallback.
  - **Fund transfer** (`TRF-…`): Dr destination / Cr source — both user-owned accounts.
- **Reports — current vs planned source of truth** — the four financial statements still derive from operational tables today. `GET /reports/trial-balance` is the first journal-driven report and provides the parity check. The flip ships once a daily reconciliation report proves journals match operational totals.
- **Reversal** — `POST /sales/:id/reverse`, `POST /purchases/:id/reverse`, `POST /payments/:id/reverse`. Each posts a balancing journal entry (signs flipped, linked by `reverses_journal_entry_id`), books an inverse stock movement where applicable, and marks the original row `reversedAt` / `reversedBy` / `reversalReason`. Original rows stay visible. Idempotent. Reason text required.
- **Period locking** — `accounting_periods` with statuses `OPEN`, `SOFT_CLOSED` (posts allowed with UI warning), `HARD_CLOSED` (posts rejected). Endpoints `POST /periods`, `POST /periods/:id/soft-close`, `POST /periods/:id/hard-close`, `POST /periods/:id/reopen`, `GET /periods`. Overlapping ranges are rejected on create. The `JournalService.assertOpen(entryDate)` hook gates every post — anything routed through `JournalService.post()` honours the lock automatically.
- **Read-only journal browser** — `GET /journals?from=…&to=…&limit=…` lists journal entries newest-first with their lines; `GET /journals/:id` returns one entry with full detail.

### 13. UX / UI
- **Branded** — "Hassan Electronics · Home Appliances". The HE monogram (source: `erp-frontend/logo.jpeg`) is the application icon — browser favicon, Windows Start Menu / Taskbar / Explorer thumbnail. [scripts/make-icons.ps1](scripts/make-icons.ps1) chroma-keys out the black backdrop and emits the transparent PNG set + a multi-resolution Windows `.ico`. The logo is rendered **only** on the Sign in and Request access screens (transparent, no chip backdrop). The in-app chrome shows the wordmark, not the logo.
- **Light & Dark theme** — toggle in the topbar; preference persisted in `localStorage` under `hassan-theme`. Initial theme honours `prefers-color-scheme`. No flash on load (theme bootstrap script in `index.html` runs before React). A theme toggle also sits in the top-right of the login card so users can flip themes before signing in.
- **Flat Windows 10 design** — [tokens.css](erp-frontend/src/styles/tokens.css) + [app.css](erp-frontend/src/styles/app.css) hold every variable. Solid surfaces, sharp 90° corners (zero border-radius), 1px borders, no glass / blur / aurora / glow / animation. Lightweight `color` / `background` / `border` transitions only. `content-visibility: auto` on long tables. Built for low-end hardware.
- **Fonts** — Segoe UI Variable / Segoe UI system stack for text; Cascadia Code / Consolas for numbers, voucher refs, SKUs. No web fonts — system stack only.
- **Coloured sidebar icons** — every nav item gets a tinted square chip in its own `--nav-c` token. Each of the 14 sidebar entries owns a distinct Fluent-palette hue so they're recognisable at a glance: Dashboard blue, POS red, Cash Book forest-green, Customer teal, Sales magenta, Supplier burnt-orange, Purchase lavender, Item sky-blue, Stock moss-green, Employee indigo, Account amber, Users cyan, Reports deep-purple, System grey. Active item paints a 3px accent strip on the left edge of the row.
- **Sticky topbar** — 44 px tall, solid surface. Global search input on the left, login bell + user chip + theme toggle on the right. Hamburger appears on the left ≤ 860 px to open the off-canvas sidebar.
- **Collapsible sidebar rail** — the brand chip at the top of the sidebar doubles as the rail toggle: click it to collapse the desktop sidebar to a 56 px icon-only rail; click again to expand. State persists in `localStorage` (`hassan-sidebar-rail`). Disabled on mobile (≤ 860 px), where the off-canvas drawer pattern is used.
- **Responsive** — sidebar becomes a fixed off-canvas drawer ≤ 860 px; grids collapse, tables get horizontal scroll, POS stacks vertically, cart rows reflow.
- **Status chips** — semantic-color filled rectangles. Used for payment states, low-stock badges, session status, sync-queue status.
- **Accent colour — three-layer resolution** (highest priority first):
  1. **User pick** — `System → Accent` presents two explicit modes: **Follow Windows accent** (auto-syncs with Windows/macOS Personalisation) or **Use custom accent** (9 Win10-style preset swatches + an HTML5 color input + a hex text field). The custom-mode choice persists in `localStorage.hassan-accent-color` and is applied **before the first paint** via [erp-frontend/src/theme/accent.js](erp-frontend/src/theme/accent.js) so there's no flash of the old colour on cold load. The "Follow Windows" card is disabled outside the Electron wrapper.
  2. **OS accent (Electron only)** — the desktop wrapper reads `systemPreferences.getAccentColor()` and pushes it into the renderer on every page load and on `accent-color-changed`. Injected JS bails if the localStorage override is set, so a user pick always wins.
  3. **Default Windows blue** — `#0078d4` (defined in [tokens.css](erp-frontend/src/styles/tokens.css)).

  Every accent surface (primary buttons, hub-tab underline, active sidebar strip, focus rings, the Adjusted Net Income row on the Income Statement, etc.) resolves through `var(--primary)` / `var(--info)`. The same `applyAccent()` writes `--primary-hover` (12 % darker), `--primary-soft` (18 % alpha for chip fills), `--accent-pressed` (25 % darker), `--primary-fg` (auto-picked white or `#1f1f1f` for AAA contrast).

---

## Technical stack

| Layer | Tech |
|---|---|
| Backend | NestJS 11 (TypeScript), TypeORM 0.3, class-validator, `@nestjs/schedule` |
| Database | PostgreSQL via Supabase Session pooler **or** local SQLite (`better-sqlite3`) — same code, switched by env |
| Frontend | React 19 + HashRouter + axios + CRA build system |
| Theming | CSS custom properties driven by `data-theme="light"|"dark"` on `<html>` |
| Desktop | Electron 40 + electron-builder 25 (NSIS / DMG / AppImage targets) |
| Native | `better-sqlite3` rebuilt against Electron's Node ABI by `@electron/rebuild` during packaging |
| Testing | Jest with an in-memory SQLite TypeORM data source per spec |

---

## Architecture

```
                                                ┌─────────────────────────┐
  Shop PC (cashier laptop / desktop)            │  Supabase Postgres      │
  ┌────────────────────────────────────┐        │  (Session pooler)       │
  │ Electron wrapper                   │        └──────────▲──────────────┘
  │   ├─ NestJS backend (port 3001)    │                   │ sync/push
  │   │   ├─ TypeORM → SQLite          │                   │ (idempotent
  │   │   │   <userData>/erp.sqlite    │                   │  by event.id)
  │   │   ├─ OutboxModule              │                   │
  │   │   ├─ SyncModule (manual flush)─┼───────────────────┘ ▲
  │   │   ├─ ReportsModule (read-only) │      Sync button in │
  │   │   ├─ AuditSubscriber           │      topbar triggers│
  │   │   └─ ErrorLogFilter            │      POST /sync/flush
  │   │
  │   └─ React build via app://localhost│
  │       (custom protocol; HashRouter) │
  └────────────────────────────────────┘

                Cloud (same NestJS code)
              ┌────────────────────────────────┐
              │ NestJS backend (any host)      │
              │   ├─ TypeORM → Supabase        │
              │   │   (DATABASE_URL set)       │
              │   └─ POST /api/sync/push       │
              │       SyncModule receiver      │
              └────────────────────────────────┘
```

The backend codebase is the **same** in both places — it switches between SQLite and Postgres based on whether `DATABASE_URL` is set. The cloud-side backend additionally receives sync events; the local-side backend additionally pushes its outbox upstream.

---

## Repo layout

```
erp-backend/
├─ src/
│  ├─ main.ts                 # NestJS bootstrap; listens on PORT (3001)
│  ├─ app.module.ts           # TypeORM datasource + module wiring; SQLite ↔ Postgres switch
│  ├─ common/                 # shared entities (BaseEntity, Setting), delete-guard, pagination
│  ├─ modules/
│  │  ├─ accounts/            # Cash / Bank / Wallet / Capital / Credit
│  │  ├─ attendance/
│  │  ├─ audit-logs/          # AuditSubscriber → audit_logs
│  │  ├─ backup/              # daily snapshot + restore
│  │  ├─ brands/
│  │  ├─ cash-register/       # cash entries + day sessions
│  │  ├─ categories/          # self-referencing tree
│  │  ├─ customers/
│  │  ├─ damaged-goods/
│  │  ├─ employee-incentives/ # rules + computed earnings
│  │  ├─ employee-transactions/
│  │  ├─ employees/           # roster + salary accrual cron
│  │  ├─ error-logs/          # global exception filter → error_logs
│  │  ├─ fund-transfers/
│  │  ├─ incentives/          # supplier/brand targets + awards
│  │  ├─ items/               # catalogue + categories M2M
│  │  ├─ outbox/              # local sync queue
│  │  ├─ payments/            # IN (receipts) + OUT (payments)
│  │  ├─ pos/                 # sessions + cart + checkout
│  │  ├─ purchase-orders/
│  │  ├─ purchases/
│  │  ├─ reports/             # ledgers + 4 financial statements
│  │  ├─ returns/             # sale-returns + purchase-returns
│  │  ├─ sales/               # invoice + lines; transactional stock OUT
│  │  ├─ stock/               # on-hand summary, movements, reason-driven adjust
│  │  ├─ stock-transfers/     # inter-store transfers
│  │  ├─ stores/
│  │  ├─ suppliers/
│  │  ├─ sync/                # manual push (POST /sync/flush) + /sync/push receiver (cloud side)
│  │  └─ users/               # auth, users CRUD, access requests, login events
│  └─ testing/test-db.ts      # in-memory TypeORM helper for spec files

erp-frontend/
├─ logo.jpeg                  # source brand mark (HE monogram on black)
├─ public/
│  ├─ index.html              # theme + accent bootstrap before React renders
│  ├─ manifest.json           # PWA name + icon set
│  ├─ favicon.ico             # generated by scripts/make-icons.ps1
│  └─ logo192/512/1024.png    # generated; transparent
├─ src/
│  ├─ api/client.js           # axios instance, baseURL resolver, tiny GET cache
│  ├─ auth/AuthContext.js     # token + user, auto /auth/me on boot
│  ├─ components/             # Layout, Brand, Icon, ThemeToggle, HubFrame, etc.
│  ├─ nav/hubs.js             # single source of truth for sidebar + hubs
│  ├─ pages/                  # Dashboard, POS, Login, Accent, Financials, …
│  ├─ theme/                  # ThemeContext, accent.js
│  └─ styles/                 # tokens.css, app.css (flat Windows 10)

erp-desktop/
├─ src/main.js                # Electron main: spawn backend, load build, OS accent push
├─ build-resources/
│  ├─ icon.ico                # multi-resolution Windows icon
│  └─ config.example.json     # template for <userData>/config.json
└─ scripts/
   ├─ prepare-resources.js    # build backend + frontend + stage native deps
   ├─ rebuild-native.js       # better-sqlite3 Electron-ABI rebuild
   └─ postinstall.js          # lenient native rebuild (dev convenience)

scripts/
└─ make-icons.ps1             # chroma-key logo.jpeg → favicon + Windows .ico
```

---

## Setup & run

### Prerequisites
- **Node.js 24+** (Node 22 also fine if you avoid newer syntax in `prepare-resources.js`)
- (Optional, for Electron packaging) **Visual Studio Build Tools 2022** with "Desktop development with C++" — node-gyp finds it via the registry. Not needed if you stay on the pinned Electron 40 (uses prebuilt better-sqlite3 binaries).

### Two-terminal dev
```bash
cd erp-backend
npm install
npm run start:dev          # http://localhost:3001/api · health: http://localhost:3001/api/health

# in a second terminal
cd erp-frontend
npm install
npm start                  # http://localhost:3000
```

On first boot the backend seeds a SUPERUSER (`admin` / `Tech@123`). Change the password from `Users → Change Password`.

### Production builds
```bash
cd erp-backend && npm run build      # → erp-backend/dist
cd erp-frontend && npm run build     # → erp-frontend/build (single-page bundle for app://localhost in Electron, or any static host on the web)
```

---

## Environment variables

`erp-backend/.env` (gitignored). Either set `DATABASE_URL` for Postgres / Supabase or leave it blank for SQLite.

```dotenv
# Server
PORT=3001                # API listen port

# Database — pick one
DATABASE_URL=postgresql://postgres.<project-ref>:<urlenc-password>@aws-1-<region>.pooler.supabase.com:5432/postgres
SQLITE_PATH=             # fallback path when DATABASE_URL is unset; Electron forces <userData>/erp.sqlite
DB_SYNC=true             # auto-create schema on boot — Postgres only; SQLite always syncs
DB_SSL=true              # Postgres only

# Optional
CLOUD_SYNC_URL=https://your-host.example.com/api/sync/push   # local node pushes outbox here when the user clicks "Sync"
BACKUP_DIR=              # default erp-backend/backups/; Electron forces <userData>/backups

# HMAC auth for /sync/push — required on BOTH ends when CLOUD_SYNC_URL is set.
# The local node refuses to push if these are unset; the cloud receiver
# rejects every request without a valid signature.
SHOP_ID=hassan-main      # short identifier; cloud rejects pushes whose X-Shop-Id doesn't match
SHOP_SYNC_SECRET=        # 32+ random bytes (hex). Generate with:
                         # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Migrations on boot. When `true`, the backend applies any pending TypeORM
# migrations before opening port 3001. The Electron main process sets this
# automatically for packaged installs; dev (`npm run start:dev`) leaves it
# unset and relies on `DB_SYNC=true`.
DB_MIGRATE_ON_BOOT=false
```

**Supabase gotchas** — use the **Session pooler** (`pooler.supabase.com:5432`), NOT the Direct connection (free-tier blocks IPv4) and NOT the Transaction pooler on `:6543` (breaks TypeORM prepared statements). The pooler username is `postgres.<project-ref>`, not plain `postgres`. URL-encode special characters in the password (`@` → `%40`).

> ⚠️ **Production warning — `DB_SYNC=true` is dev-only.** The example `.env` above ships with `DB_SYNC=true` because the project does not have TypeORM migrations yet. On Postgres / Supabase this lets TypeORM silently `ALTER` or `DROP` columns whenever an entity diff changes — irrecoverable data loss is one rogue refactor away. Switch `DB_SYNC=false` before the database holds anything you can't reproduce, and run the schema diff through a migration. Adding proper migration tooling (baseline + per-change, auto-applied at Electron startup before the API port opens) is part of the planned hardening pass at the bottom of this README.

---

## Mobile / LAN access

The CRA dev server binds to `0.0.0.0`. From a phone on the same network, visit `http://<your-LAN-IP>:3000` — the API client at [src/api/client.js](erp-frontend/src/api/client.js) resolves the API base URL from `window.location.hostname`, so the page auto-targets `http://<LAN-IP>:3001` instead of the phone's own localhost.

To find your LAN IP on Windows: `ipconfig` → look for an IPv4 address starting with `192.168.…` or `10.0.…`.

The Electron build doesn't need LAN — the renderer loads from the custom `app://localhost` scheme and the API client targets `http://localhost:3001`.

---

## Desktop installer (Electron)

The Electron wrapper produces a fully self-contained NSIS installer. The shop PC needs no prior Node install — the bundle ships:

- The Electron shell (asar)
- `resources/backend/{dist,node_modules,package.json}` — the NestJS API the shell launches at startup. Native `better-sqlite3` rebuilt against Electron's Node ABI.
- `resources/frontend/build/` — the React build the shell serves via a custom `app://localhost` protocol (registered in `erp-desktop/src/main.js` with `protocol.handle('app', …)` and an SPA fallback to `index.html`). The renderer is **not** loaded with `file://` — under `file://` Chromium reports `window.location.origin === "null"`, which makes React Router 7 throw "Failed to construct 'URL': Invalid URL" inside `new URL(path, origin)`. `app://localhost` gives the renderer a real origin and the crash disappears.

### Renderer sandboxing

The Electron `BrowserWindow` runs with `contextIsolation: true` and `nodeIntegration: false`. The renderer has no direct access to Node APIs, the filesystem, or `require`. The preload script ([erp-desktop/src/preload.js](erp-desktop/src/preload.js)) exposes a deliberately tiny `window.erpBridge` IPC surface (currently only `setTitleBarTheme`). A hypothetical XSS inside the React build cannot read `<userData>/erp.sqlite` or shell out to the OS — it sees the same DOM a regular browser tab would see. The planned hardening pass adds `sandbox: true`, a strict CSP, and Helmet on the backend on top of this.

### Window chrome (VS Code-style)

The Electron window deliberately drops the native menu bar (`Menu.setApplicationMenu(null)`) and hides the native title bar (`titleBarStyle: 'hidden'`). Windows still draws the minimize / maximize / close controls in the top-right via `titleBarOverlay` (44 px tall, theme-aware). The in-app `.topbar` becomes the drag region (`-webkit-app-region: drag`), with `no-drag` opt-outs on every interactive child so buttons, the search box, and the user chip still receive clicks. A tiny [erp-desktop/src/preload.js](erp-desktop/src/preload.js) exposes `window.erpBridge.setTitleBarTheme(theme)` so the overlay colours flip light↔dark when the user toggles the theme.

### Build the installer

```bash
cd erp-desktop
npm install
npm run package:win        # → release/Hassan Electronics ERP-Setup-1.0.0.exe  (~115 MB)
```

`package:win` chains `npm run prepackage` (build backend + frontend, rebuild native deps for Electron) and `electron-builder --win --x64`. On macOS / Linux:

```bash
npm run package:mac        # .dmg (universal arm64 + x64)
npm run package:linux      # AppImage (x64)
npm run package            # current platform
```

**NSIS installer settings:** per-user (no admin needed), oneClick off (user gets a Next / Install flow), `allowToChangeInstallationDirectory: true`, creates Desktop + Start Menu shortcuts named "Hassan Electronics ERP". **Unsigned** — Windows SmartScreen warns on first run; click *More info → Run anyway*. To suppress this, ship a code-signing certificate via electron-builder's `signtoolOptions`.

> **Electron version pin.** `erp-desktop/package.json` pins `electron` to `^40.0.0`. better-sqlite3 v12.10 only publishes Electron prebuilts through ABI `electron-v145` (= Electron 40); newer Electron majors (41+) force a source compile via node-gyp which fails without MSVC Build Tools. If you bump Electron, either wait for a matching better-sqlite3 release or install "Build Tools for Visual Studio 2022" with the **Desktop development with C++** workload.

### Wire the install to Supabase

After install (per user), drop a `config.json` at:

- **Windows:** `%APPDATA%\erp-desktop\config.json`
- **macOS:** `~/Library/Application Support/erp-desktop/config.json`
- **Linux:** `~/.config/erp-desktop/config.json`

```json
{
  "cloudSyncUrl": "https://your-cloud-host.example.com/api/sync/push",
  "databaseUrl": ""
}
```

- `cloudSyncUrl` set → local node pushes outbox events to your deployed cloud receiver every 30 s. The local SQLite remains authoritative; the cloud is eventually-consistent.
- `databaseUrl` set → backend skips SQLite and runs **directly** against Supabase (useful for shop branches with reliable internet that want to bypass offline mode).
- Both unset → app runs purely offline against local SQLite.

The Electron main process reads `config.json` on every launch and injects the values as env vars into the spawned backend. No re-install needed when the cloud URL changes.

---

## Backups

The backup is a full JSON snapshot of every business table (sales, purchases, payments, items, stock movements, cash sessions, fund transfers, incentives, outbox / sync queue, …). User tables (`users`, `user_access_requests`, `user_login_events`) are intentionally excluded so a snapshot never leaks credentials.

- **Scheduled** — an hourly `@Cron` runs and snapshots if today's scheduled hour has passed and no backup exists for today (default 20:00).
- **Manual snapshot** — `System → Backups → Save backup now` writes a snapshot to disk on the server.
- **Download snapshot** — `Download snapshot` streams an in-memory snapshot to the browser as a file download. No file persisted server-side (useful for USB-stick copies). A backup is a frozen-in-time copy of the whole business — every customer, supplier price, margin, salary, and owner-capital figure — so every download is recorded against the user, and a planned hardening pass adds SUPERUSER re-auth + IP + SHA-256 capture on top of that.
- **Restore** — `Restore from file` accepts a JSON snapshot (any size up to 100 MB) and replaces the contents of every business table inside a single TypeORM transaction. Express body limit is bumped to 100 MB in `main.ts` for this.
- **Storage** — defaults to `erp-backend/backups/` in dev; Electron forces `<userData>/backups` so backups survive uninstalls. Path shown in the Status card.

---

## Testing

Backend has 142 Jest tests across 14 spec files covering the high-value services:

```bash
cd erp-backend && npm test            # full suite, ~6 s
cd erp-backend && npx jest --coverage # coverage report
```

Tests use an isolated in-memory SQLite TypeORM data source per spec ([src/testing/test-db.ts](erp-backend/src/testing/test-db.ts)) — no Supabase calls, no shared state. Coverage on the tested services: stock 100 %, pos 96 %, categories 93 %, sales 91 %, purchases 91 %, items 90 %, reports 88 %, sync 59 % (cron worker not exercised), outbox 75 %.

**Untested (intentional):** `accounts`, `brands`, `customers`, `suppliers`, `stores`, `payments`, `returns` — thin CRUD wrappers identical in shape to the 93 %-covered `categories.service`.

---

## Project conventions

- **Module-per-domain** — every backend domain owns its entities / DTOs / service / controller under `src/modules/`. New domain → new folder. New variant of an existing domain → new tab in the parent hub, not a new module.
- **TypeORM columns** — snake_case in DB via `name: 'foo_bar'`, camelCase in entity. `.orderBy()` must use the camelCase property name.
- **Dialect-portable date columns** — use `@Column({ type: Date, ... })` (the `Date` constructor), NOT `@Column({ type: 'timestamp' })` or `@Column({ type: 'datetime' })`. `Date` resolves to `datetime` on SQLite and `timestamp without time zone` on Postgres. The string `'timestamp'` is Postgres-only and crashes better-sqlite3 with `DataTypeNotSupportedError`; `'datetime'` is the reverse trap.
- **Indexes** — 107 `@Index` decorators across 41 entities target the columns each service actually filters or sorts on. Composite indexes for filter + sort or filter + filter patterns. Same decorators auto-create in both SQLite and Supabase Postgres via `synchronize: true` on next boot.
- **DTO validation** — every Create / Update DTO uses class-validator decorators. The global `ValidationPipe` has `whitelist`, `transform`, and `forbidNonWhitelisted` on — extra fields throw.
- **Auto-generated voucher numbers** — `INV-NNNNNN`, `BILL-NNNNNN`, `SR-NNNNNN`, `PR-NNNNNN`, `RCT-NNNNNN`, `PMT-NNNNNN`, `TRF-NNNNNN`, `PO-NNNNNN`, `DMG-NNNNNN`, `STK-TRF-NNNNNN`, and master-data codes `CUST-`, `SUPP-`, `EMP-`, `ACC-`, plus employee-transaction prefixes (`SAL-`, `ADV-`, `RBT-`, …). Every prefix routes through `SequenceService.next(prefix, seedFromMax?)` which atomically increments a row in the `sequences` table (`prefix` PK, `nextValue` int). On Postgres the read is `SELECT … FOR UPDATE` to block concurrent allocators; on SQLite the single-writer connection serialises increments. Sequences are seeded on first call from `repo.count()` so a fresh install starts at 1 and an existing one resumes from the next available number. Numbers may have gaps from rolled-back transactions, but two distinct calls never produce the same value.
- **Quick-search bar everywhere** — `CrudPage` exposes `searchKeys={[...]}` so each list page controls which fields it searches over.
- **Delete = safe** — every master-data delete is wrapped in `deleteOrConflict` ([erp-backend/src/common/delete-guard.ts](erp-backend/src/common/delete-guard.ts)) which catches DB foreign-key violations (Postgres `23503` / SQLite `FOREIGN KEY constraint failed`) and turns them into a friendly 409 telling the user to use Close instead.
- **Reports are read-only** — no writes allowed inside `ReportsService` or its controller.
- **Outbox decouples sales from sync** — `OutboxService` is the only thing both sales / purchases / POS and the sync worker depend on. Do not make `SalesModule` import `SyncModule` (circular).
- **HashRouter, not BrowserRouter** — required so the SPA fallback inside the `app://` protocol handler works on any sub-route.
- **Renderer loads through `app://localhost`, never `file://`** — `file://` makes `window.location.origin === "null"` in Chromium, which crashes React Router 7's internal `new URL()` calls with "Failed to construct 'URL': Invalid URL".
- **Sync runs only on the user's command** — the topbar "Sync" button calls `POST /api/sync/flush`. There is no background cron; don't add one back without product agreement.
- **No native menu bar** — `Menu.setApplicationMenu(null)` in the Electron main is deliberate. Surface new app-level actions inside the React topbar / sidebar instead.
- **Auth** — opaque server tokens (not JWT), 12-hour sliding window. `AuthGuard` is global; mark public endpoints with `@Public()`.
- **No DB triggers** — cross-cutting concerns use TypeORM `EntitySubscriber` (already done for audit logs).
- **No migrations yet** — `synchronize: true` on SQLite, gated by `DB_SYNC=true` on Postgres. Switch to migrations before treating Supabase as production.
- **Profit accounting** — `netIncome` is the trading result; `adjustedNetIncome = netIncome + incentive awards in period`. The Statement of Changes in Equity reconciles against `adjustedNetIncome`.

See [CLAUDE.md](./CLAUDE.md) for the AI-assistant guide with the same conventions and the explicit "don'ts".

---

## Planned hardening (Phase 4)

A directional roadmap, agreed for a single-shop install operated by the owner and one accountant. Items below are **scoped** to a 1-2 person shop — the enterprise patterns common in multi-cashier chains (granular role matrices, MFA, maker-checker chains) are deliberately out of scope; see the bottom of this section.

**Status legend:** ✅ shipped · 🛠 in progress · 🔜 next up · ⏳ deferred (separate session)

### Security & data protection

- ✅ **HMAC-signed sync** — `SyncSignatureGuard` validates `X-Shop-Id` / `X-Sync-Timestamp` / `X-Sync-Signature` on every `POST /api/sync/push`. Rejects on missing headers, shop-id mismatch, > 5 minute timestamp skew, or signature mismatch (constant-time compared). Local node refuses to push if `SHOP_ID` / `SHOP_SYNC_SECRET` are unset. See [erp-backend/src/modules/sync/sync-signature.guard.ts](erp-backend/src/modules/sync/sync-signature.guard.ts) + [erp-backend/src/modules/sync/hmac.util.ts](erp-backend/src/modules/sync/hmac.util.ts). 18 dedicated specs cover sign/verify and guard rejection cases.
- ✅ **Body limit scoped** — `main.ts` sets the global Express body limit to `256kb`; `POST /api/backup/restore` gets a route-prefix `json({ limit: '100mb' })` registered before the global parser. body-parser's `req._body` guard makes the second middleware a no-op for the restore path, so the large body is only allowed for that one endpoint.
- ✅ **Helmet + CORS allow-list** — `app.use(helmet({ contentSecurityPolicy: false }))` ships X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, etc. CORS is restricted to `app://localhost`, `http://localhost:{3000,3001}`, `http://127.0.0.1:{3000,3001}`, and private-network IPv4 LAN origins (10/8, 172.16/12, 192.168/16). All other origins are rejected. CSP is intentionally disabled for now until the inline theme-bootstrap script in `index.html` is extracted to an external file with a nonce — see deferred items.
- ✅ **Electron sandbox** — `webPreferences` now has `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`. The renderer's V8 context cannot `require`, touch the filesystem, or shell out. The preload script exposes a tiny `window.erpBridge` IPC surface (currently only `setTitleBarTheme`).
- ✅ **Sequence-table voucher numbers** — `sequences` table + global `SequenceService.next(prefix, seedFromMax?)` replaces every `count + 1` voucher generation. Postgres uses `SELECT … FOR UPDATE`; SQLite relies on its single-writer guarantee. 13 call sites migrated (`INV`, `BILL`, `SR`, `PR`, `RCT`, `PMT`, `TRF`, `PO`, `DMG`, `STK-TRF`, `CUST`, `SUPP`, `EMP`, `ACC`, plus per-type employee-transaction prefixes).
- ❌ **At-rest encryption (SQLite + backups) — explicitly out of scope.** For this deployment, confidentiality is the lowest of the C-I-A trio: integrity and availability come first. Encryption would *hurt* availability (lose the key → lose every backup, brick the SQLite file) without addressing any threat that actually exists. The SQLite file lives on the same disk as the encrypted-only-in-name backups; anyone who can read one already has the other. Stays plaintext on purpose.
- ✅ **Backup-restore hardening (integrity)** — `@SuperuserOnly()` on `/backup/restore`, `/backup/download-now`, and `/backup/:id/download`. `/backup/restore` requires either an `X-Reauth-Token` header (call `POST /auth/reauthenticate` first; one-shot, 60-second TTL) or the legacy `password` body field. This protects against a left-open session accidentally wiping the DB. Download endpoints carry the SUPERUSER guard but **no** reauth gate — they're read-only and confidentiality isn't the threat model. See [erp-backend/src/modules/users/reauth.service.ts](erp-backend/src/modules/users/reauth.service.ts).
- ✅ **Strict CSP** — extracted the inline theme-bootstrap `<script>` in `public/index.html` to [erp-frontend/public/theme-bootstrap.js](erp-frontend/public/theme-bootstrap.js); added a `<meta http-equiv="Content-Security-Policy">` with `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; …`. Helmet's CSP is enabled on the backend with the same defaults for API responses (defense in depth).
- ✅ **TypeORM migrations** — new [erp-backend/src/data-source.ts](erp-backend/src/data-source.ts) for the CLI. Scripts `db:migrate`, `db:migrate:revert`, `db:migrate:generate`, `db:migrate:create` in `erp-backend/package.json`. The main process applies pending migrations on launch when `DB_MIGRATE_ON_BOOT=true` (Electron desktop sets it automatically). `DB_SYNC` is unchanged for dev. To baseline production from the current Supabase schema: `cd erp-backend && npm run db:migrate:generate -- src/migrations/InitialSchema`, commit the result, flip `DB_SYNC=false`, and from then on every schema change ships as a migration. Until that baseline is generated, treat `DB_SYNC=true` against a populated Supabase DB as the per-deployment one-time first-run.

### Accounting integrity

- ✅ **True double-entry journals (parallel ledger)** — new `journal_entries` + `journal_lines` tables. Every business write — sale, purchase, receipt, payment, fund transfer — routes through `JournalService.post()` in the same TypeORM transaction as the source row. The post is rejected if `SUM(debit) !== SUM(credit)`. Source-of-truth status: the journals are a **parallel ledger** today — postings happen on every write, but the four financial statements still derive from operational tables. A follow-up commit will flip reports to read from `journal_lines` once a daily reconciliation report proves parity. See [erp-backend/src/modules/journals/](erp-backend/src/modules/journals/). 9 dedicated specs cover balance invariants, period gating, and reversal posting.
- ✅ **Full chart-of-accounts hierarchy** — `accounts` now carries `accountCategory` (ASSET / LIABILITY / EQUITY / INCOME / EXPENSE), `accountSubType` (CURRENT_ASSET / FIXED_ASSET / INVENTORY_ASSET / RECEIVABLE / CURRENT_LIABILITY / LONG_TERM_LIABILITY / PAYABLE / OWNERS_EQUITY / RETAINED_EARNINGS / OPERATING_INCOME / OTHER_INCOME / COGS / OPERATING_EXPENSE / OTHER_EXPENSE), `parentAccountId`, and `isControl`. Seeded on first boot: 8 control nodes (`1000 Assets`, `1100 Current Assets`, `1200 Fixed Assets`, `2000 Liabilities`, `3000 Equity`, `4000 Revenue`, `5000 COGS`, `6000 Operating Expenses`) plus 6 leaf system accounts (`1110 Cash on Hand`, `1140 Accounts Receivable`, `1150 Inventory`, `2100 Accounts Payable`, `4100 Sales Revenue`, `5100 Cost of Goods Sold`). `JournalService.post()` rejects lines whose `accountId` points to a control account. Existing user accounts are auto-classified (Cash/Bank/Wallet → ASSET, Capital → EQUITY, Credit → LIABILITY). System / control accounts cannot be deleted from the API.
- ✅ **Accounting period locking** — `accounting_periods (name, startDate, endDate, status, closedAt, closedBy, closeReason)`. Status transitions: `OPEN → SOFT_CLOSED → HARD_CLOSED`, plus an explicit `reopen` action. `JournalService.post()` calls `PeriodsService.assertOpen(date)`: SOFT_CLOSED passes (UI shows a warning), HARD_CLOSED rejects. Endpoints `POST /periods`, `POST /periods/:id/{soft-close,hard-close,reopen}`, `GET /periods`. Coverage is "best effort by way of journals" — anything bypassing JournalService bypasses the period check, but every write in scope today posts through it. 9 dedicated specs.
- ✅ **Reversal workflow (no hard delete on financial data)** — `POST /sales/:id/reverse`, `POST /purchases/:id/reverse`, `POST /payments/:id/reverse`, `POST /fund-transfers/:id/reverse`. Each one (a) finds the original journal entry, (b) posts a balancing reversal via `JournalService.reverse()` linked by `reverses_journal_entry_id`, (c) books an inverse stock movement (IN for a sale reversal, OUT for a purchase reversal, none for payments or transfers), (d) marks the original row `reversedAt` / `reversedBy` / `reversalReason`. Original rows stay visible with the reversal metadata. Idempotent — re-calling on an already-reversed row is a no-op. Reason text is required. 4 dedicated reversal specs in `sales.service.spec.ts`.

### Tax & Pakistan compliance

- **GST / sales-tax engine** — settings-level `defaultGstRatePercent`, `sellerNtn`, `sellerStrn`, `taxInclusivePricing`. Per-item `gstRatePercent` + `taxCategory` (STANDARD / EXEMPT / ZERO_RATED). Lines carry `subtotal` / `gstRate` / `gstAmount` / `lineTotal`. Journal posting includes `Cr GST Payable` on sales / `Dr GST Input` on purchases.
- **FBR-compliant tax invoice format** — seller name / STRN / NTN / address, buyer NTN (optional), item-wise breakdown with taxable value + tax amount, tax rate, total tax, grand total, payment mode. Reserve a placeholder for FBR invoice number + QR code.
- **FBR POS real-time integration** — `fbr-pos-integration` module behind `FBR_POS_INTEGRATION=true`. After checkout, POST the invoice to the FBR POS API; persist FBR invoice number + QR data on the sale row. Failures queue in `fbr_pos_outbox` for retry — the shop never stops selling because the FBR API is down.
- **Withholding tax on supplier payments** — supplier `withholdingTaxRatePercent` + `filerStatus`. On `PMT-…`, post `Dr A/P` / `Cr Bank` / `Cr WHT Payable`. Monthly WHT report for FBR filing.

### Appliance-specific features

- **Serial-number tracking per unit** — `item_serials (serial UNIQUE, status, purchasedAt, purchasePrice, soldAt, soldToCustomerId, soldInvoiceId, warrantyStartAt, warrantyMonths, currentLocationStoreId)`. Item-level `tracksSerials` toggle (default true for appliances). Purchase flow prompts for N serials; POS flow prompts for the picked serial; returns require a matching sold serial linked to the same customer.
- **Warranty management** — receipt prints warranty expiry per serialised line. Public `GET /warranty/lookup?serial=…` (rate-limited) returns only purchase date + expiry (no PII). Reports: warranty claims register, warranties expiring this month.
- **Installment (qist) sales** — `installment_plans (saleId, downPayment, installmentAmount, installmentCount, frequencyDays, startDate, lateFeePercent)` + `installment_schedule (planId, dueDate, expectedAmount, paidAmount, status, lateFeeApplied)`. New POS payment mode `INSTALLMENT`. Daily cron marks OVERDUE and applies late fees. Installments aging report.
- **Delivery / dispatch tracking** — `deliveries (saleId, address, phone, assignedDriverId, vehicle, status, scheduledFor, deliveredAt, customerSignatureUrl)`. POS checkout offers a "deliver" toggle. Dashboard tile: pending deliveries today.
- **Service / repair tickets** — `service_tickets (customerId, itemSerialId, complaint, status, estimatedCost, actualCost, inWarranty)`. Parts consumed → `Dr Service COGS / Cr Inventory`; revenue → `Dr Cash / Cr Service Income`.

### Sales & inventory features

- 🔜 **Quotation → Sales Order → Invoice flow** — `quotations (QUO-…)` and `sales_orders (SO-…)`. No journal posting and no stock impact until converted to an invoice. "Convert to sale" button pre-fills the POS cart.
- 🔜 **Discount engine** — line-level + invoice-level discounts. `discount_schemes` table for "buy N of X, get discount on Y" rules with date ranges and auto-application at POS. Discount over a configurable threshold requires SUPERUSER reauth (the only maker-checker pattern kept — it's a same-person reauth, not a second-person approval).
- ✅ **Customer credit limit** — `creditLimit` + `creditEnabled` on `Customer`. `SalesService.create()` rejects any sale with `dueAmount > 0` when the customer has `creditEnabled === false` or when the projected outstanding would exceed `creditLimit`. Walk-in / no-customer sales are exempt. 5 dedicated specs in `sales.service.spec.ts > credit-limit gating`. SUPERUSER-reauth override token deferred to the discount engine pass.
- 🔜 **Multi-UOM** — `units_of_measure` (PIECE / BOX / CARTON / DOZEN / …). Item has `baseUomId` + `item_uom_conversions` (1 CARTON = 6 PIECES). Lines store `qty` + `qtyInBaseUom`.
- 🔜 **Reorder-point suggestions** — Item-level `reorderPoint`, `reorderQty`, `preferredSupplierId`, `leadTimeDays`. New `Stock → Reorder Suggestions` tab with one-click "Create PO" per preferred supplier (groups items by supplier into PO drafts).
- 🔜 **Physical stock take** — `stock_takes` (DRAFT / COUNTING / REVIEW / POSTED) + `stock_take_lines`. SUPERUSER posts the variance; one reason-driven stock adjustment is produced per item.
- 🔜 **Barcode label printing** — Code-128 internal barcodes for items without a manufacturer barcode. `Item → Print Labels` tab renders printable A4 of 3×8 labels.

### Reporting

- ✅ **A/R and A/P aging** — `GET /reports/ar-aging?asOf=…` and `GET /reports/ap-aging?asOf=…` → customer/supplier | 0-30 | 31-60 | 61-90 | 90+ | total. FIFO receipt allocation against the oldest unpaid sales; opening balance counted as oldest. See `ReportsService.arAging()` / `apAging()`. 4 dedicated specs in `reports.service.spec.ts`.
- ✅ **Item profitability** — `GET /reports/item-margins?from=…&to=…` → item | qty sold | revenue | COGS | gross profit | margin %, sortable by gross profit. COGS uses current `item.purchasePrice` as the cost basis (refined to weighted-average when the journal layer ships per-batch cost tracking). 1 dedicated spec.
- ✅ **Trial balance** — `GET /reports/trial-balance?asOf=…` derives totals from `journal_lines` aggregated by account; sets `balanced: false` if Dr / Cr totals diverge (which would indicate a posting got past `JournalService`'s balance invariant). 1 dedicated spec proves the seeded sales+purchase posts roll up to balanced totals.
- ✅ **Journal-driven Income Statement + Balance Sheet (parallel)** — `GET /reports/income-statement-from-journals?from=…&to=…` aggregates INCOME-category credits and EXPENSE-category debits into `revenue / expense / netIncome`. `GET /reports/balance-sheet-from-journals?asOf=…` aggregates ASSET / LIABILITY / EQUITY balances with current-period earnings rolled in; sets `balanced: false` if `assets !== liabilities + equity + earnings`. Both ship **alongside** the existing operational-table reports so a reconciliation tool can diff them. The full read-side flip (replacing the operational reports with these) follows once the parity is observed in production over a closing cycle.
- 🔜 **Z-report / X-report** — end-of-session PDF with cashier, open / close times, opening cash, expected closing, actual closing, variance, transaction count, totals by payment mode, top 10 items, refunds + voids counts.
- 🔜 **Comparative Income Statement** — current period vs prior period vs prior-year columns.

### Audit & observability

- **Backup-grade audit on backup-download** — the existing `AuditSubscriber` already captures entity-write before/after diffs; planned: a `System → Audit` diff-view UI with user / module / record / date-range filters.
- **Structured logging + health metrics** — JSON log lines from the backend; `/health` extended with sync queue depth, last-sync result, last-backup status.

### Explicitly out of scope (1-2 user shop)

These were considered and dropped because the workload doesn't justify the friction or the engineering effort for an install operated by one or two trusted people on a single shop PC:

- **Granular RBAC with 6 named roles + permission matrix** — the existing `SUPERUSER` / `USER` split is enough for owner + accountant.
- **TOTP MFA mandatory on SUPERUSER** — adds login friction on a trusted machine the owner controls physically.
- **Maker-checker approval workflows / `pending_approvals` table / multi-level approval chains** — there's no second human reviewer to approve.
- **Brute-force lockout + per-username failure counter table** — the backend listens on localhost (and optional LAN); it's not internet-exposed.
- **httpOnly-cookie sessions + CSRF double-submit** — current `Authorization: Bearer …` from localStorage is sufficient given the threat model (no XSS surface in a build of self-authored React with no user-generated content rendered as HTML).
- **Code-signed installer** — kept on the list of "nice to have" but not in this pass; Windows SmartScreen warning is the cost.

If the shop scales past two users or the install starts running on internet-exposed hardware, revisit this list — none of the dropped items are unreachable, just unjustified today.
