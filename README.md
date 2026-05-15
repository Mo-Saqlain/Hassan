# Hassan Electronics — Home-Appliances ERP & POS

Offline-first ERP with an integrated Point-of-Sale terminal for a single home-appliances retail shop. Inventory, master data, vouchers, customer / supplier / account ledgers, a daily cash register with session-based opening, fund transfers between owner accounts (Capital ↔ Cash ↔ Bank ↔ Wallet ↔ Credit), an incentive-tracking system that feeds adjusted-net-income, daily JSON backups with restore, the four standard financial statements, and access control with a single superuser who approves new users. The same backend codebase runs locally against SQLite (desktop install) or against Supabase Postgres in the cloud. Designed to keep selling even when the internet is down — sales queue up locally and sync to the cloud when connectivity returns.

![Status](https://img.shields.io/badge/status-Phase%201%20%2B%202%20%2B%203%20complete-brightgreen)
![Tests](https://img.shields.io/badge/tests-81%20Jest%20specs-success)
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

**Accounts:** five flavours — **Cash**, **Bank**, **Wallet** (Easypaisa / JazzCash), **Capital** (owner's equity), **Credit** (credit card or credit line — shows as a liability on the balance sheet when negative).

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

### 8. Reports — four financial statements + ledgers
- **Income Statement** — Revenue → COGS → Gross Profit → Operating Expenses → Net Income → Incentive Awards → Adjusted Net Income.
- **Balance Sheet** — Assets (cash, bank, wallet, A/R) | Liabilities (A/P, credit lines) + Equity (Capital − Drawings + Retained Earnings). `asOf` filterable.
- **Cash Flow Statement** — operating + investing-style cash movement, including fund transfer deltas per account.
- **Statement of Changes in Equity** — Opening + Adjusted Net Income − Drawings = Closing.
- **Stock Ledger** with category / brand / supplier filters.

### 9. Cloud sync (offline-first, manual trigger)
- Every business transaction at the local node enqueues an event in the `sync_queue` outbox table (`SALE_CREATED`, `PURCHASE_CREATED`, `POS_SALE_CREATED`, `POS_SESSION_STARTED`, `POS_SESSION_CLOSED`).
- **Sync is manual, not scheduled.** A "Sync" button in the topbar shows the pending count as a badge, spins while the request is in flight, and toasts the result ("Synced 3 events.", "Nothing to sync.", or the error message from the cloud). Clicking it calls `POST /api/sync/flush`, which drains up to 50 pending entries and returns a `{ ok, cloudConfigured, attempted, succeeded, failed, message }` summary. The button hides itself entirely when `CLOUD_SYNC_URL` is not configured.
- The cloud receiver (`POST /api/sync/push`) is **another instance of this same NestJS backend** deployed against Supabase Postgres. It applies events with idempotency by event ID — duplicate event IDs return `DUPLICATE`, never re-applied. So Supabase is always eventually-consistent with what the shop did, with no special online-mode in the cashier UI.

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
- **User tables are excluded from backups** so a snapshot never leaks credentials.

### 12. UX / UI
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
```

**Supabase gotchas** — use the **Session pooler** (`pooler.supabase.com:5432`), NOT the Direct connection (free-tier blocks IPv4) and NOT the Transaction pooler on `:6543` (breaks TypeORM prepared statements). The pooler username is `postgres.<project-ref>`, not plain `postgres`. URL-encode special characters in the password (`@` → `%40`).

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
- **Download snapshot** — `Download snapshot` streams an in-memory snapshot to the browser as a file download. No file persisted server-side — useful for USB-stick copies that leave no trace.
- **Restore** — `Restore from file` accepts a JSON snapshot (any size up to 100 MB) and replaces the contents of every business table inside a single TypeORM transaction. Express body limit is bumped to 100 MB in `main.ts` for this.
- **Storage** — defaults to `erp-backend/backups/` in dev; Electron forces `<userData>/backups` so backups survive uninstalls. Path shown in the Status card.

---

## Testing

Backend has 81 Jest tests across 9 spec files covering the high-value services:

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
- **Auto-generated voucher numbers** — `INV-NNNNNN`, `BILL-NNNNNN`, `SR-NNNNNN`, `PR-NNNNNN`, `RCT-NNNNNN`, `PMT-NNNNNN`, `TRF-NNNNNN`, `PO-NNNNNN`. Sequence is `count + 1` — not gap-free. Swap for a sequences table if you need strict sequencing.
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
