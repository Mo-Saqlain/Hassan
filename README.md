# Hassan Electronics — Home-Appliances ERP & POS

Offline-first ERP with an integrated Point-of-Sale terminal for a small home-appliances retail shop. Inventory, master data ("Catalogue"), vouchers, customer/supplier/account ledgers, a daily cash register with session-based opening, fund transfers between owner accounts (Capital ↔ Cash ↔ Bank ↔ Credit), an incentive-tracking system that feeds adjusted-net-income, daily JSON backups with restore, a four-statement financials report, and **user access control with a single superuser who approves new users**. All backed by Supabase Postgres in the cloud, with a desktop Electron build that bundles a local SQLite for true offline cashier operation. **UI is a violet→cyan aurora-glass redesign** ([design.md](./design.md)) — sticky topbar, glass cards, gradient brand mark, coloured sidebar icon chips, light + dark themes, responsive off-canvas drawer.

![Status](https://img.shields.io/badge/status-Phase%201%20%2B%202%20%2B%203%20complete-brightgreen)
![Tests](https://img.shields.io/badge/tests-82%2F82%20passing-success)
![Backend](https://img.shields.io/badge/backend-NestJS%20%2B%20TypeORM-e0234e)
![Frontend](https://img.shields.io/badge/frontend-React%2019%20%2B%20HashRouter-61dafb)
![Theme](https://img.shields.io/badge/themes-light%20%2B%20dark-6366f1)

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
9. [API reference](#api-reference)
10. [Frontend screens](#frontend-screens)
11. [Testing](#testing)
12. [Deployment options](#deployment-options)
13. [Project conventions](#project-conventions)

---

## What this is

A retail ERP for a single-store shop selling home appliances. The cashier rings up sales through a barcode-driven POS terminal. The same database tracks purchases from suppliers, stock movements, customer credit, supplier dues, and produces the four standard financial statements.

Everything is **offline-first**: the cashier can keep selling when the internet is down. Sales queue up locally and sync to the cloud when connectivity returns.

---

## Functional features

### 1. Point of Sale (POS)
- **Model-number scan** — single 46px input that auto-focuses with a bolt-icon prefix. Placeholder: *"Type model no. — e.g. DAWLANCE LVS-15"*. Backend matches barcode first then SKU then model no., but the cashier UI only mentions model no.
- **Cart** with re-scan stacking (scanning the same item again increments the existing line)
- **Inline quantity** +/− buttons, line remove, clear cart
- **Payment methods**: Cash, Card, Bank, Credit
- **Pick the receiving account** — on every CASH / CARD / BANK sale the cashier picks which **cash drawer / bank / wallet** account is being credited. The picker is filtered to `CASH` accounts for cash sales and to `BANK + WALLET` accounts for card / bank transfers. That sale's paid amount then flows through `/reports/account-ledger/:id`, the Balance Sheet, and the Cash Flow statement against the chosen account — so a Rs.50,000 card-tap sale credits the correct HBL account, not a generic "cash" bucket. CREDIT sales don't ask for an account (nothing is collected yet).
- **Partial payment** — paid amount can be less than net; the remainder becomes a customer **receivable**. The Checkout panel switches its bottom row to read `Receivable · 25,000` and shows a banner explaining that the unpaid balance will be added to the customer's A/R. Selecting a customer is **required** for partial pay and for CREDIT sales — both the frontend and the backend enforce this so receivables never end up orphaned on a walk-in.
- **Change due** — when paid > net, the same row reads `Change · …` so the cashier knows how much to hand back.
- **In-flow customer create** — `+` button next to the customer dropdown opens a modal; saves and auto-selects on close
- **In-flow item create on Purchases** — every Purchase-line item picker has a **+ New** button that opens a quick-add item modal (Model No, Name, Brand, SKU, Barcode, Purchase + Sale price). Saves to `/items`, prepends to the dropdown, auto-selects on the originating line, and prefills the line's unit price.
- **Session lifecycle** — Start session → ring up sales → Close session. Running `salesTotal` and `salesCount` displayed
- **Receipt printing** — every checkout shows a "Print receipt" link to a print-friendly route that auto-fires the browser's print dialog

### 2. Catalogue (formerly "Master Data")
Renamed to **Catalogue** in the sidebar and page header. URL stays at `/master` for backwards compat. One sidebar entry, seven tiles:

| Tile | Entity | Notes |
|---|---|---|
| Items | `items` | **Model No. is the primary identifier** (used as the item's display name). SKU auto-derives from Model No. on save (suffixed `-2`, `-3`… on collision) — you only see / fill SKU if you click "Advanced". **Barcode UI removed** — the shop identifies items by model no., not barcode. Brand FK, M2M categories, prices, unit, min-stock level. **Quick search** bar at the top filters as you type across model no. / name / SKU / brand. Includes a Close / Reopen action that hides the item from new transactions without deleting history. |
| Categories | `categories` | self-referencing tree (sub-categories), cycle-protected |
| Brands | `brands` | simple name + description |
| Customers | `customers` | name + contact + opening balance + **live computed balance**. Close / Reopen action to deactivate without losing ledger history. |
| Suppliers | `suppliers` | same shape as customers, A/P side. Same Close / Reopen action. |
| Stores | `stores` | multi-branch ready (single store works fine) |
| Accounts | `accounts` | Five types — **Cash**, **Bank**, **Wallet**, **Capital** (owner's equity contributions), **Credit** (credit card / credit line). All can take part in fund transfers. |

### 3. Transactions (consolidated, grouped)
One sidebar entry. Tiles are now grouped into four labeled sections:

| Group | Tile | Effect |
|---|---|---|
| **Sales** | Sales History | Read-only list of POS-generated invoices, payment-status badges, reprint |
| **Sales** | Sale Returns | Goods back from customers → stock IN |
| **Purchases** | Purchases | Stock from suppliers → stock IN |
| **Purchases** | Purchase Returns | Goods returned to suppliers → stock OUT |
| **Money** | Receipts | Money in from customers (RCT-…) |
| **Money** | Payments | Money out to suppliers (PMT-…) |
| **Treasury** | Fund Transfers | Move money between your own accounts (Capital → Cash, Cash → Bank, Bank → Credit, …). Auto-numbered TRF-NNNNNN. |

### 4. Inventory
- **Stock Summary** — every item's current on-hand quantity vs minimum, with Low/OK status. Quick-search bar filters by item name or SKU.
- **Stock Ledger** — every IN/OUT movement, filterable by item, category, brand, supplier, and date range, with running balance per row
- **Reason-driven manual adjustment** — `POST /api/stock/adjust` allows write-off / count correction. The frontend never asks the user to pick "IN" or "OUT" directly; instead they pick a **reason** (`Loss / stolen`, `Damaged`, `Found`, `Stock count — was over / under`, `Correction +/−`) and the direction follows automatically. The form shows current on-hand and the projected new on-hand, and blocks submission if the adjustment would drive stock negative — preventing the common mistake of writing-off losses as a stock INCREASE.

### 5. Ledgers
- **Customer Ledger** — chronological list of every sale, sale return, payment-at-sale, and receipt voucher for one customer, with Debit / Credit / running Balance columns. A positive balance means the customer owes you.
- **Supplier Ledger** — same, liability-side. A positive balance means you owe the supplier.
- **Account Ledger** — *new.* Per-account history for any Bank / Wallet / Cash / Capital / Credit account. Shows every payment voucher, fund-transfer in/out, and POS sales explicitly attributed to that account (`SALE_RECEIPT` rows for the picked cash drawer / bank / wallet). CASH accounts also pick up legacy cash sales / purchases that weren't account-attributed. Running balance starts from the account's opening balance. Dropdown is grouped by account type for fast switching.

### 6. Daily Cash Register (sidebar entry)
A real cashier's day book. Sidebar → **Cash Book**.

- **Session-based opening flow** — each shop-day starts with a session. System computes the expected opening cash (carry-over from prior day's closing), cashier counts the till and enters the **Actual Cash Counted**. Any difference is highlighted, and if there's a shortfall the cashier can **book a Fund Transfer in the same atomic open-session POST** (e.g. Capital → Cash) to balance the till before opening.
- **Closing flow** — at end of day, cashier counts again, system records expected vs actual closing and the closing difference. CLOSED sessions block further entries on the frontend.
- **Day book table** — every cash movement of the day in one chronological view: explicit cash-book entries (EXPENSE / MISC / OPENING / CLOSING_ADJUSTMENT / OTHER) plus cash-tagged Sales, Purchases, Receipts, Payments, and transfers in/out of cash accounts. Running balance per row.
- **MISC warning** — if Miscellaneous entries exceed **10% of daily throughput** AND are ≥ Rs.1000 absolute, a banner appears asking the cashier to recategorise. Thresholds at the top of `cash-register.service.ts`.

### 7. Incentives (sidebar entry under Reports)
Track manufacturer / supplier incentive targets and bookings.

- **Targets** — define on an **Item** or whole **Brand**, with target quantity, period window, and the incentive amount unlocked when the target is hit. Optionally linked to a supplier.
- **Progress tab** — real-time bar chart of net sold (sold − returned) vs target qty inside the period, with achievement status.
- **Awards** — book actual payouts received (optionally tied to a target — pre-fills label / amount / period).
- **Profit reporting** — the Income Statement always shows an `Incentives` section and computes `Adjusted Net Income = Net Income + Incentive Awards`. The Statement of Changes in Equity uses the adjusted figure for its reconciliation. Designed for the "sell at Rs.5000 loss to clear a target that unlocks Rs.8000 incentive" pattern.

### 8. Financial Statements
Single page with four tabs:
- **Income Statement** — Revenue → Discounts → Returns → COGS (item-cost approximation) → Gross Profit → Net Income → **(+) Incentive Awards** → **Adjusted Net Income**
- **Balance Sheet** — Cash / Bank / Wallet / Inventory at cost / Accounts Receivable | Accounts Payable + **Credit Payable** | Equity broken down into **Owner Capital Contributed** + **Retained Earnings** (point-in-time, with `asOf` filter)
- **Cash Flow** — Operating receipts + cash sales − payments − cash purchases; bridges beginning to ending cash (includes fund-transfer deltas into/out of cash+bank+wallet)
- **Statement of Changes in Equity** — Opening + Adjusted Net Income − Drawings = Closing, with a reconciliation row that shows the diff between expected and actual

### 9. Cloud sync (Phase 2)
- Local node enqueues `SALE_CREATED`, `PURCHASE_CREATED`, `POS_SALE_CREATED` events to a local outbox table
- A background cron pushes the outbox to a configured `CLOUD_SYNC_URL` every 30 seconds when set
- Cloud receiver is idempotent — duplicate event IDs return `DUPLICATE` with the previous result_id, not a re-applied transaction

### 10. Daily Backups + Restore
Snapshot every business table (sales, purchases, payments, customers, items, stock movements, cash-register sessions, fund transfers, incentives, sync queue, …) to a single JSON file on local disk. Backups are tracked in a `backups` table with file path, size, and trigger (`AUTO` vs `MANUAL`).

- **Why JSON?** Portable across DB engines (the same file restores into either SQLite or Postgres), human-readable so you can open it in any editor, and no external binary like `pg_dump`/`sqlite3` is required on the cashier PC. Downside is bigger files than a binary dump — irrelevant at shop scale.
- **Auto daily backup** — `BackupScheduler` ticks hourly and creates a snapshot if (a) the configured hour matches the current hour AND (b) no backup has already been taken today. Default hour: **20 (8 PM)**, configurable through the UI without restarting.
- **Manual snapshot** — sidebar → System → Backups → **"💾 Save backup now"** triggers a manual snapshot stored on the server. **"⬇ Download snapshot"** generates a snapshot in-memory and pushes it straight to the browser as a download — no file persisted server-side, useful when you want a copy on a USB stick without leaving traces on the till.
- **Restore** — same Backups page has a 🔥 *Restore from backup* card. Pick any `.json` backup file, type `RESTORE` to confirm, **re-enter your account password** (verified against the signed-in user, so a left-open session isn't enough to nuke the shop's data), and the backend will (1) auto-create a **Pre-restore safety snapshot** of the current DB as an `AUTO` backup that's reversible, then (2) wipe every business table and replay the chosen snapshot inside a single transaction with FK enforcement temporarily disabled (`PRAGMA foreign_keys = OFF` on SQLite, `SET session_replication_role = 'replica'` on Postgres). The `backups` history itself is preserved across restores. Body limit is raised to **100 MB** in `main.ts` so multi-megabyte snapshots aren't rejected.
- **Overdue prompt** — every page checks `/api/backup/status` on mount and polls every 5 minutes. If today's backup hasn't been taken and the scheduled hour has passed, a red banner appears at the top of the main pane with a one-click link to the Backups page. Dismissible per session.
- **Backup history** — Backups page lists the last 200 backups with file name, source (AUTO/MANUAL), size, notes, and per-row Download / Delete actions.
- **Storage location** — defaults to `erp-backend/backups/` in dev; Electron points `BACKUP_DIR` at `<userData>/backups` so backups travel with the desktop install. Path is shown in the Status card.

### 10b. Audit log + Error log

Both surfaced under **System → Audit** and **System → Errors**.

- **Audit log** — every TypeORM insert / update / delete on a user-facing entity is captured by [erp-backend/src/modules/audit-logs/audit.subscriber.ts](erp-backend/src/modules/audit-logs/audit.subscriber.ts) and written to `audit_logs` with a human-readable summary plus a small JSON snapshot of the affected fields (or a before→after diff for updates). The subscriber filters out its own table, the outbox queue, and the error log to avoid recursion and noise. The frontend page has entity-type / action / date filters, quick-search, and **CSV + PDF export**. The audit log is intentionally append-only — there is no "Clear" button and no `DELETE /audit-logs` endpoint, so the trail can't be wiped from the UI.
- **Error log** — a global Nest exception filter ([erp-backend/src/modules/error-logs/error-log.filter.ts](erp-backend/src/modules/error-logs/error-log.filter.ts)) writes every error response to `error_logs` with method, path, status code, message, stack, and a JSON snapshot of the request body / query / params. Validation 400s and 404s are tagged `WARN`; 5xx are tagged `ERROR`. The frontend page has level / source filters, quick-search, expandable stack viewer, and **CSV + PDF export**. Clearable from the System → Errors tab.

### 10c. Access control (users, roles, login)

The app is now gated by a sign-in screen. Two roles only: **SUPERUSER** and **USER**.

- **Seed superuser** — on every backend boot, [erp-backend/src/modules/users/users.service.ts](erp-backend/src/modules/users/users.service.ts) ensures a superuser exists. Default credentials: username **`admin`** / password **`Tech@123`** — change this from System → Users → "Change my password" on first login.
- **Passwords are hashed** — `scrypt` with a 16-byte random salt, 64-byte derived key, constant-time comparison ([password.util.ts](erp-backend/src/modules/users/password.util.ts)). No plaintext password ever lands in the DB.
- **Sessions** — login returns an opaque 64-char token; the frontend stores it in `localStorage` and sends `Authorization: Bearer <token>` on every request. A sliding 12-hour window auto-renews on activity. The global `AuthGuard` ([auth.guard.ts](erp-backend/src/modules/users/auth.guard.ts)) protects every endpoint except `/auth/login`, `/auth/request-access`, `/health`, and `/sync/push` (cloud webhook).
- **Login screen** — a clean centred card with sign-in + a "Request access" button that opens a sign-up form (desired username, full name, optional phone/email/reason). Submitting **does not create a user** — it creates a `user_access_requests` row that the superuser must review.
- **Superuser-only**: creating users, resetting other users' passwords, enabling/disabling accounts, approving/rejecting access requests, plus the **Audit log** and **Error log** tabs. Regular users can still take **backups** and use the rest of the ERP.
- **Login bell** in the topbar (superuser only) — polls every 30s and shows a badge with the count of pending access requests + unseen logins. Opening the panel marks logins as seen.
- **Logout confirmation** — clicking *Logout* in the topbar opens a small modal asking "Sign out?" before actually clearing the session, so an accidental touch on the POS terminal can't kick a cashier mid-sale.
- **Users hub** — its own sidebar entry (between Account and Reports) with a four-tab strip: **Info** (admin: CRUD + enable/disable/delete), **Allow Access** (admin: approve/reject pending access requests), **Recent Login** (admin: last 200 sign-ins), **Change Password** (everyone changes their own; admin gets an extra card to reset any other user's password too). The first three tabs are filtered out for regular users by [HubFrame](erp-frontend/src/components/HubFrame.js); the sidebar entry's `defaultTo` lands non-admins on Change Password directly.
- **Backups don't touch users** — `users`, `user_access_requests`, and `user_login_events` are excluded from both `dumpAll()` and `restoreFromSnapshot()` in [backup.service.ts](erp-backend/src/modules/backup/backup.service.ts). Restoring a tampered backup cannot inject a fake superuser, cannot replay leaked password hashes, and cannot wipe the existing user list — the boot-time seed re-creates `admin` only if the table is somehow empty.
- **Last-superuser guard** — the service refuses to remove, demote, or deactivate the only remaining active SUPERUSER, so the app can never end up unmanageable.
- **Audit log skips user mutations** — credential / login activity has its own viewer; the day-to-day audit feed stays focused on business entities.

### 10d. Monthly salary accrual

Each employee can declare a `salaryDay` (1–31) and `firstSalaryInAdvance` flag. The [erp-backend/src/modules/employees/salary-accrual.service.ts](erp-backend/src/modules/employees/salary-accrual.service.ts) cron ticks hourly; on the configured day of the month it posts a `SALARY_ACCRUED` transaction equal to the employee's `monthlySalary` to their ledger as a **debit** (we now owe them). The cashier later books a `SALARY` payment (credit) when handing over the cash, and the ledger nets out.

- Idempotent per (employee, calendar month) — re-running the cron or restarting the server never creates a duplicate.
- Months that don't have the configured day (e.g. day=31 in February) collapse to the last day of the month so nothing is silently lost.
- `firstSalaryInAdvance` controls the joining month only: if `true`, the first accrual fires in the month they joined; if `false`, the first accrual waits until the following calendar month.
- A **Run salary accrual** button at the top of the Employees panel calls `POST /employees/accrue-salaries` for manual catch-up after server downtime; `POST /employees/:id/accrue-salary` targets a single employee.

### 11. CSV + PDF Exports
Every list-like view exposes a pair of **CSV / PDF** buttons (top-right of the page header or panel) wired to a shared `<ExportButtons>` component ([erp-frontend/src/components/ExportButtons.js](erp-frontend/src/components/ExportButtons.js)) backed by helpers in [erp-frontend/src/utils/exporters.js](erp-frontend/src/utils/exporters.js).

- **CSV** — generated client-side as UTF-8 with a BOM (so Excel opens it correctly), saved as `<filename>_<YYYYMMDD_HHMM>.csv`. Values are auto-escaped (commas, quotes, newlines), nested objects are JSON-stringified.
- **PDF** — opens a new tab with a clean print-friendly table (Hassan Electronics letterhead + timestamp), then fires `window.print()`. The user picks "Save as PDF" as the destination — works on every platform without shipping a PDF library on the server.

Coverage:

| Where | CSV / PDF exports |
|---|---|
| Master Data → Items | Model No., SKU, Barcode, Brand, Categories, Purchase, Sale, Unit, Min, Active |
| Master Data → Categories | Indented path, Description, Active |
| Master Data → Customers / Suppliers | Name, Phone, Email, Address, Opening, Balance, Status, Active |
| Master Data → Brands / Stores / Accounts | All columns defined on the CrudPage |
| Customer / Supplier / Account Ledgers | Date, Ref, Type, Description, Debit, Credit, Balance + closing-balance footer |
| Stock Ledger | Date, Item, SKU, Store, Type, Qty, Reference, Running |
| Stock Summary | Item, SKU, On hand, Min, Status (Low/OK) — *new* |
| Purchase Orders | PO #, Order date, Supplier, Status, Total, Item count |
| Financial Statements (all 4 tabs) | Flattened {Item, Amount} rows of every line in the statement |

### 12. UX / UI
- **Branded** — "Hassan Electronics · Home Appliances" with custom logo mark
- **Light & Dark theme** — toggle in the sidebar footer; preference persisted in `localStorage`, initial theme honours `prefers-color-scheme`. No flash on load (theme bootstrap script in `index.html` runs before React).
- **Flat Windows 10-inspired design** — `tokens.css` + `app.css` ([src/styles/](erp-frontend/src/styles/)) hold every variable. Solid surfaces, sharp 90° corners everywhere (no border-radius), 1px borders, no glass / blur / aurora / glow / animation. Lightweight `color` / `background` / `border` transitions only. `content-visibility: auto` on long tables. Built for low-end hardware while keeping the modern ERP feel.
- **Coloured sidebar icons** — every nav item gets a tinted square chip in its own `--nav-c` token (Dashboard blue, POS red, Catalogue violet, Transactions teal, Cash green, Stock orange, Ledgers teal, Reports violet, System grey). Active item paints a 3px accent strip on the left edge of the row.
- **Sticky topbar** — 44px tall, solid surface. Global search input on the left, login bell + user chip + theme toggle on the right. Hamburger appears on the left ≤ 860px to open the off-canvas sidebar.
- **Collapsible sidebar rail** — the brand chip at the top of the sidebar doubles as the rail toggle: click it to collapse the desktop sidebar to a 56px icon-only rail; click again to expand. State persists in `localStorage` (`hassan-sidebar-rail`). Disabled on mobile (≤860px), where the off-canvas drawer pattern is used instead.
- **Responsive** — sidebar becomes a fixed off-canvas drawer ≤ 860px (`.app[data-nav="open"]` toggles); grids collapse, tables get horizontal scroll, POS stacks vertically, cart rows reflow.
- **Status chips** — semantic-color filled rectangles, six variants (`chip-success`, `chip-warn`, `chip-danger`, `chip-info`, `chip-violet`, neutral). Used for payment states, low-stock badges, session status.
- **Fonts** — Segoe UI Variable / Segoe UI system stack (no web fonts to download); Cascadia Code / Consolas for numbers, voucher refs, SKUs.
- **OS accent colour (Electron only)** — on Windows / macOS the desktop wrapper reads the user's Personalisation accent colour via `systemPreferences.getAccentColor()` and injects it into the renderer as `--primary` / `--primary-hover` / `--primary-soft` / `--info` / `--border-glow` on every page load and on the `accent-color-changed` event. The whole UI (buttons, hub tabs, active sidebar item, focus rings, balance-sheet net-income row) re-themes live without a restart. In the browser build the default Windows blue (`#0078d4` light, `#4cc2ff` dark) is used.

---

## Technical stack

| Layer | Tech |
|---|---|
| Backend | NestJS 11 (TypeScript), TypeORM, class-validator, `@nestjs/schedule` |
| Database | PostgreSQL (Supabase) — falls back to local SQLite (`better-sqlite3`) when `DATABASE_URL` unset |
| Frontend | React 19, React Router 7 (HashRouter), axios |
| Build | Create React App (frontend), `nest build` (backend) |
| Desktop | Electron (spawns the backend as a child process pointing at local SQLite) |
| Testing | Jest + ts-jest with in-memory SQLite for service unit tests |
| Fonts | Plus Jakarta Sans + Inter via Google Fonts CDN |
| Icons | Inline SVG (custom Lucide-style stroke set, ~25 icons) |
| Styling | CSS variables, no UI framework |

---

## Architecture

```
                     ┌─────────────────────────────────────────────────┐
                     │                  Cashier PC                     │
                     │                                                 │
   barcode scanner ─►│   Electron shell                                │
                     │   ├─ React frontend  (port 3000 in dev)         │
                     │   │   HashRouter, light/dark, responsive        │
                     │   │                                             │
                     │   └─ NestJS backend  (port 3001)                │
                     │       ├─ TypeORM → SQLite (offline-first DB)    │
                     │       ├─ OutboxModule  (local sync queue)       │
                     │       └─ SyncModule worker (cron, 30 s)         │
                     └────────────────────┬────────────────────────────┘
                                          │ HTTPS, when online
                                          ▼
                     ┌─────────────────────────────────────────────────┐
                     │                Cloud (optional)                 │
                     │                                                 │
                     │   NestJS backend mirror  (e.g. Render / Fly)    │
                     │       └─ POST /api/sync/push (idempotent)       │
                     │             │                                   │
                     │             ▼                                   │
                     │   Supabase Postgres (pooler, ap-south-1)        │
                     └─────────────────────────────────────────────────┘
```

The backend codebase is the **same** in both places — it switches between SQLite and Postgres based on whether `DATABASE_URL` is set. The cloud-side backend additionally receives sync events; the local-side backend additionally pushes its outbox upstream.

### Backend module map

```
src/
├─ app.module.ts          # composition root, DB selector
├─ main.ts                # bootstrap, ValidationPipe, CORS
├─ common/entities/       # BaseEntity (id, createdAt, updatedAt)
├─ testing/test-db.ts     # in-memory TypeORM helper for spec files
└─ modules/
   ├─ brands/             # CRUD
   ├─ categories/         # self-referencing tree, cycle-protected
   ├─ items/              # SKU + barcode unique, M2M categories, /lookup
   ├─ customers/          # CRUD + opening balance
   ├─ suppliers/          # CRUD + opening balance
   ├─ stores/             # CRUD
   ├─ accounts/           # Cash / Bank / Wallet / Capital / Credit
   ├─ stock/              # movement ledger, on-hand, OUT validation
   ├─ sales/              # voucher + lines + stock OUT (transactional)
   ├─ purchases/          # voucher + lines + stock IN  (transactional)
   ├─ returns/            # sale-return + purchase-return
   ├─ payments/           # IN (receipt) + OUT (payment), filterable
   ├─ fund-transfers/     # Treasury moves between own accounts (Capital/Cash/Bank/…)
   ├─ cash-register/      # cash_entries day book + cash_register_sessions (open/close)
   ├─ incentives/         # incentive_targets + incentive_awards; feeds Adjusted Net Income
   ├─ pos/                # session + cart + checkout
   ├─ outbox/             # local sync queue (decouples sales/purchases from sync)
   ├─ sync/               # receiver (POST /sync/push) + cron worker
   ├─ employees/          # CRUD + monthly SalaryAccrualService (hourly cron, idempotent per month)
   ├─ employee-transactions/ # SALARY_ACCRUED (debit) + SALARY/ADVANCE/REIMBURSEMENT/EXPENSE/INCENTIVE_PAYOUT/ADJUSTMENT (credits)
   ├─ audit-logs/         # AuditSubscriber + REST; every insert/update/delete on a user-facing entity
   ├─ error-logs/         # ErrorLogFilter (global Nest exception filter) + REST
   ├─ users/              # User + UserAccessRequest + UserLoginEvent + AuthGuard (global) + /auth + /users
   └─ reports/            # read-only: ledgers, stock ledger, 4 financial statements (consumes IncentivesService + FundTransfersService)
```

### Frontend page map

```
src/
├─ App.js, App.css, index.css, index.js
├─ api/client.js          # axios instance; resolves API host from window.location.hostname
├─ theme/ThemeContext.js  # data-theme attr + localStorage
├─ hooks/useResource.js   # tiny GET-list hook
├─ nav/hubs.js            # single source of truth for sidebar entries + hub-tab definitions
├─ components/
│  ├─ Layout.js           # flat sidebar + main, mobile drawer, rail toggle
│  ├─ HubFrame.js         # layout route: title + horizontal tab strip + <Outlet />
│  ├─ GlobalSearch.js     # topbar search across customers/suppliers/items/employees/accounts
│  ├─ Brand.js            # logo mark (also the rail toggle)
│  ├─ Icon.js             # SVG icon library (~25 icons)
│  ├─ ThemeToggle.js
│  ├─ CrudPage.js         # generic CRUD form+table used by simple master-data panels
│  ├─ LedgerView.js       # shared by customer + supplier ledger pages
│  ├─ VoucherPage.js      # shared by Receipts + Payments
│  └─ master/             # ItemsPanel.js, CategoriesPanel.js (richer than CrudPage)
└─ pages/
   ├─ Dashboard.js        # stat cards
   ├─ MasterData.js       # tile selector + 7 panels
   ├─ POS.js              # POS terminal
   ├─ Transactions.js     # grouped tile sections: Sales / Purchases / Money / Treasury
   ├─ Sales.js            # read-only sales history
   ├─ SaleReturns.js
   ├─ Purchases.js
   ├─ PurchaseReturns.js
   ├─ Receipts.js, Payments.js
   ├─ FundTransfers.js    # Treasury transfers between own accounts
   ├─ CashRegister.js     # daily cash book with session open/close flow
   ├─ Incentives.js       # Targets / Progress / Awards tabs
   ├─ Stock.js            # on-hand summary
   ├─ StockLedger.js      # filterable movement ledger
   ├─ CustomerLedger.js
   ├─ SupplierLedger.js
   ├─ Financials.js       # 4-tab financial statements
   ├─ AuditLog.js         # System → Audit (every entity mutation, filterable, CSV/PDF)
   ├─ ErrorLog.js         # System → Errors (exceptions captured by the global filter)
   ├─ users/              # Users hub — split per tab
   │  ├─ UsersInfo.js              # Info tab (admin: list/create/enable/disable/delete)
   │  ├─ UsersAllowAccess.js       # Allow Access tab (admin: approve/reject access requests)
   │  ├─ UsersRecentLogin.js       # Recent Login tab (admin: sign-in history)
   │  └─ UsersChangePassword.js    # Change Password tab (everyone; admin sees an extra "reset others" card)
   ├─ Login.js            # /login — sign-in + Request access flow
   └─ InvoicePrint.js     # auto-print invoice route

src/auth/
├─ AuthContext.js         # token + user persistence, login/logout/changePassword
└─ RequireSuperuser.js    # route guard for /audit-log + /error-log + admin tabs of /users
```

### Sidebar layout (flat hubs with horizontal tab strip)

The sidebar is a flat list — one entry per domain — and the sub-pages of each domain live behind a horizontal **tab strip** rendered above the page body. Clicking a domain in the sidebar lands you on its default sub-page; you switch between sub-pages via the tab strip without changing rows in the sidebar.

| Sidebar entry | Default route | Tab strip (sub-pages) |
|---|---|---|
| Dashboard | `/` | — |
| POS Terminal | `/pos` | — |
| Cash Book | `/cash-register` | — |
| Customer | `/customers` | Info · Receipts · Ledger |
| Sales | `/sales` | History · Returns |
| Supplier | `/suppliers` | Info · Brands · Payments · Incentives · Ledger |
| Purchase | `/purchases` | Orders · Bills · Returns |
| Item | `/items` | Catalogue · Categories |
| Stock | `/stock` | Summary · Stores · Ledger · Transfers · Damaged |
| Employee | `/employees` | Info · Attendance · Payments · Incentive Rules · Ledger |
| Account | `/accounts` | Info · Transfers · Ledger |
| Users | `/users-change-password` | **Info*** · **Allow Access*** · **Recent Login*** · Change Password (*=superuser-only) |
| Reports | `/financials` | — |
| System | `/backup` | Backups · **Audit*** · **Errors*** (*=superuser-only) |

Routing-wise the hubs are layout routes wired in [erp-frontend/src/App.js](erp-frontend/src/App.js) with `<HubFrame title subtitle tabs />` around the matched child route ([erp-frontend/src/components/HubFrame.js](erp-frontend/src/components/HubFrame.js)). The hub definitions (label, default route, tabs) live in a single source of truth at [erp-frontend/src/nav/hubs.js](erp-frontend/src/nav/hubs.js).

The hub's title block renders above the tab strip, and CSS suppresses each sub-page's own page-header heading so you never see "Customers" stacked on top of "Customers" — the active tab pill is the only label for the current sub-page. Action buttons that share the page-header row stay visible and right-align automatically.

The old Catalogue (`/master`) and Transactions (`/transactions`) hubs still exist as routes for legacy bookmarks, but they're no longer in the sidebar — every page they linked is now its own first-class sidebar entry via dedicated routes like `/items`, `/customers`, `/employees`, `/stores`, etc.

---

## Repo layout

```
Hassan/
├─ erp-backend/   NestJS API
├─ erp-frontend/  React app (CRA)
├─ erp-desktop/   Electron wrapper
├─ erp_phase_1_detailed_design_document.md
├─ CLAUDE.md      Project guide for AI assistants
├─ README.md      This file
└─ .gitignore
```

---

## Setup & run

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm
- (Optional) A Supabase project for cloud DB. SQLite works without one.

### Install
```bash
cd erp-backend  && npm install
cd ../erp-frontend && npm install
cd ../erp-desktop  && npm install   # only if you want the desktop build
```

### Develop (two terminals)
```bash
# Terminal 1 — backend (watch mode)
cd erp-backend && npm run start:dev

# Terminal 2 — frontend (auto-opens browser unless BROWSER=none)
cd erp-frontend && npm start
```

- Backend → http://localhost:3001/api · health: http://localhost:3001/api/health
- Frontend → http://localhost:3000

### Production-style build
```bash
cd erp-backend  && npm run build && node dist/main.js   # or npm run start:prod
cd erp-frontend && npm run build   # static build/ directory
```

### Desktop (Electron)
```bash
# After building both above:
cd erp-desktop && npm start
```
Electron spawns the compiled NestJS backend as a child process pointing at `<userData>/erp.sqlite`, then opens the React build.

---

## Environment variables

`erp-backend/.env` — gitignored. Either configure Supabase or omit `DATABASE_URL` to use SQLite.

```env
# Default port (3001 if unset)
PORT=3001

# ─── Database ─────────────────────────────────────────────────────────
# Leave blank → backend uses SQLite at SQLITE_PATH (defaults to erp.sqlite).
# Use Supabase Session pooler (port 5432). Transaction pooler (6543) is NOT
# compatible with TypeORM's prepared statements.
DATABASE_URL=postgresql://postgres.<project-ref>:<password-url-encoded>@aws-1-<region>.pooler.supabase.com:5432/postgres
DB_SYNC=true   # auto-create schema on boot; turn off in production
DB_SSL=true

# ─── Cloud sync ───────────────────────────────────────────────────────
# Set on the LOCAL (shop) node so its outbox pushes events to the cloud.
# Leave blank on the cloud node itself.
CLOUD_SYNC_URL=https://erp-cloud.example.com/api/sync/push

# ─── Backups ──────────────────────────────────────────────────────────
# Directory where daily JSON snapshots are written. Defaults to
# erp-backend/backups/ — Electron overrides this to <userData>/backups.
BACKUP_DIR=./backups
```

**Supabase gotchas:**
- Free-tier projects no longer accept direct IPv4 — use the Session pooler URL from your Supabase Dashboard → Project Settings → Database → Connection string → Session pooler.
- Username on the pooler is `postgres.<project-ref>`, not plain `postgres`.
- URL-encode any special characters in your password (`@` → `%40`, `#` → `%23`, etc.).

---

## Mobile / LAN access

The dev server binds to `0.0.0.0` so any device on the same WiFi can reach it.

1. Find your PC's LAN IP (`ipconfig` on Windows, `ifconfig`/`ip a` on macOS/Linux)
2. On the phone, open `http://<LAN-IP>:3000` — for example `http://192.168.2.101:3000`
3. The API client auto-uses the same host (`http://<LAN-IP>:3001`) — no rebuild needed
4. If you hit "Site can't provide secure response", your phone's browser is forcing HTTPS — disable Chrome's *"Always use secure connections"* under Settings → Privacy and security → Security, or use Firefox

To expose on the public internet for testing, use **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:3000`). For production, deploy the backend (Render/Fly/Railway) and the frontend (Vercel/Netlify) separately.

---

## API reference

All endpoints are prefixed with `/api`. Validation pipe rejects extra fields globally.

### Master data
```
GET    /brands              POST   /brands         PATCH /brands/:id    DELETE /brands/:id
GET    /categories          GET    /categories/tree (root-nested)
POST   /categories          PATCH  /categories/:id DELETE /categories/:id
GET    /items               GET    /items/lookup?code=<sku-or-barcode>
GET    /items/search?q=&limit=     # fuzzy search across modelNo/name/sku/barcode
POST   /items               PATCH  /items/:id      DELETE /items/:id
GET    /customers           POST   /customers      PATCH /customers/:id  DELETE /customers/:id
GET    /suppliers           POST   /suppliers      PATCH /suppliers/:id  DELETE /suppliers/:id
GET    /stores              POST   /stores         PATCH /stores/:id     DELETE /stores/:id
GET    /accounts            POST   /accounts       PATCH /accounts/:id   DELETE /accounts/:id
```

### Transactions
```
GET    /sales               GET    /sales/:id       POST /sales
GET    /purchases           GET    /purchases/:id   POST /purchases
GET    /sale-returns        GET    /sale-returns/:id      POST /sale-returns
GET    /purchase-returns    GET    /purchase-returns/:id  POST /purchase-returns
GET    /payments?direction=IN|OUT    POST  /payments
GET    /fund-transfers?from=&to=     POST  /fund-transfers
GET    /fund-transfers/:id           DELETE /fund-transfers/:id
POST   /purchase-orders                    # create with line items
GET    /purchase-orders?supplierId=&status=
GET    /purchase-orders/:id
PATCH  /purchase-orders/:id/status         # DRAFT → SENT → RECEIVED → CANCELLED
DELETE /purchase-orders/:id
POST   /stock-transfers                    # paired OUT/IN movements in one atomic txn
GET    /stock-transfers?fromStoreId=&toStoreId=
GET    /stock-transfers/:id
POST   /damaged-goods                      # report damage → stock OUT on create
GET    /damaged-goods?status=
GET    /damaged-goods/tally                # totals per status
PATCH  /damaged-goods/:id/status           # → REPAIRED books a reversing stock IN
DELETE /damaged-goods/:id                  # only allowed once status is REPAIRED
```

### Cash Register
```
POST   /cash-register                       # new day-book entry
GET    /cash-register?from=&to=             # list raw entries
GET    /cash-register/day?date=YYYY-MM-DD   # daily book (entries + cash-tagged sales/purchases/vouchers/transfers)
GET    /cash-register/summary?from=&to=     # per-day opening/in/out/closing
GET    /cash-register/sessions?from=&to=    # list sessions
GET    /cash-register/sessions/status?date= # is session open/closed/missing; what's the expected opening
POST   /cash-register/sessions/open         # open today (actualOpening + optional inline FundTransfer)
POST   /cash-register/sessions/:date/close  # close a day (actualClosing → records difference)
DELETE /cash-register/:id                   # remove a cash entry
```

### Incentives
```
POST   /incentives/targets                  GET    /incentives/targets
GET    /incentives/targets/progress         # progress for ALL targets
GET    /incentives/targets/:id              GET    /incentives/targets/:id/progress
PATCH  /incentives/targets/:id              DELETE /incentives/targets/:id
POST   /incentives/awards                   GET    /incentives/awards?from=&to=
GET    /incentives/awards/total?from=&to=   # sum used by Income Statement
DELETE /incentives/awards/:id
```

### Stock
```
GET    /stock/summary
GET    /stock/movements?itemId=&storeId=
GET    /stock/on-hand?itemId=&storeId=
POST   /stock/adjust
```

### POS
```
POST   /pos/sessions                       # start
GET    /pos/sessions                       # list
GET    /pos/sessions/active
GET    /pos/sessions/:id
POST   /pos/sessions/:id/close
GET    /pos/lookup?code=<sku-or-barcode>
GET    /pos/sessions/:id/cart
POST   /pos/sessions/:id/cart              # add line
PATCH  /pos/cart/:cartItemId               # update qty/price
DELETE /pos/cart/:cartItemId
DELETE /pos/sessions/:id/cart              # clear
POST   /pos/sessions/:id/checkout
```

### Reports
```
GET    /reports/customer-ledger/:id
GET    /reports/customer-balances
GET    /reports/supplier-ledger/:id
GET    /reports/supplier-balances
GET    /reports/account-ledger/:id?asOf=     # Bank / Wallet / Cash / Capital / Credit
GET    /reports/account-balances             # all accounts with current closing balance
GET    /reports/stock-ledger?itemId=&categoryId=&brandId=&supplierId=&from=&to=
GET    /reports/income-statement?from=&to=
GET    /reports/balance-sheet?asOf=
GET    /reports/cash-flow?from=&to=
GET    /reports/equity-changes?from=&to=
```

### Sync
```
POST   /sync/push           # receiver — apply events (idempotent by event id)
GET    /sync/events         # last 200 received events
GET    /sync/queue          # local outbox view
GET    /sync/status         # { cloudConfigured, cloudUrl, pending }
POST   /sync/flush          # force the cron worker to run once
```

### Employees (salary accrual)
```
POST   /employees/accrue-salaries           # idempotent: post any due monthly accruals
POST   /employees/:id/accrue-salary         # same, single employee
```

### Audit + error logs (System tab — superuser only)
```
GET    /audit-logs?entityType=&action=&from=&to=&limit=
GET    /error-logs?level=&source=&from=&to=&limit=
DELETE /error-logs                          # wipe (testing)
```

### Auth + Users
```
# Public — no token required
POST   /auth/login                 { username, password }  → { token, user, expiresAt }
POST   /auth/request-access        { requestedUsername, fullName, phone?, email?, reason? }

# Authenticated (any role)
GET    /auth/me                    → currently signed-in user
POST   /auth/logout                # invalidates the caller's session token
POST   /auth/change-password       { currentPassword, newPassword }   # also rotates session

# Superuser only (everything below)
GET    /users                                       # list users
POST   /users                                       # create user
PATCH  /users/:id                                   # update (rename / reset pw / enable / disable / promote)
DELETE /users/:id
GET    /users/access-requests?status=PENDING|APPROVED|REJECTED
GET    /users/access-requests/pending-count
POST   /users/access-requests/:id/approve  { username, password, fullName? }   # creates the user
POST   /users/access-requests/:id/reject
DELETE /users/access-requests/:id
GET    /users/login-events?unseen=true&limit=
GET    /users/login-events/unseen-count
POST   /users/login-events/mark-seen
DELETE /users/login-events                          # purge entries older than 30 days
```

### Backup
```
POST   /backup                     # save a manual snapshot to disk
GET    /backup                     # list last 200 backup files
GET    /backup/download-now        # snapshot + download in one shot (no file saved)
GET    /backup/status              # { scheduledHour, latest, hasTodayBackup, overdue, ... }
GET    /backup/schedule            # → { hour }
POST   /backup/schedule { hour }   # change the daily backup hour (0–23)
GET    /backup/:id/download        # stream a previously-saved backup file
DELETE /backup/:id                 # remove a backup file from disk and history
POST   /backup/restore             # wipe + replay { confirm: "RESTORE", snapshot, password }
                                   #   — password is re-verified against the signed-in user
                                   #   — auto-creates a Pre-restore safety snapshot first
```

### Health
```
GET    /health   →  { status: "ok", service: "erp-backend", time: "…" }
```

---

## Frontend screens

| Route | Page |
|---|---|
| `/` | Dashboard (stat cards) |
| `/pos` | POS terminal |
| `/master` | Catalogue hub (8 tiles) — overview / legacy entry point |
| `/transactions` | Transactions hub (Sales / Purchases / Money / Treasury / Staff) — overview / legacy |
| `/items`, `/categories`, `/brands`, `/customers`, `/suppliers`, `/stores`, `/accounts`, `/employees` | Direct entity-centric routes — same panels as the Catalogue hub but with the entity's own page-head |
| `/purchase-orders` | Purchase Orders (DRAFT → SENT → RECEIVED → CANCELLED workflow with line items) |
| `/stock-transfers` | Stock transfers between stores — paired OUT/IN movements in one atomic transaction |
| `/damaged-goods` | Damaged-goods register — Damaged / In repair / Write-off / Repaired status workflow with stock book-keeping |
| `/sales` | Sales history (read-only) |
| `/sale-returns` | Sale returns |
| `/purchases` | Purchases |
| `/purchase-returns` | Purchase returns |
| `/receipts` | Receipts (cash/bank in) |
| `/payments` | Payments (cash/bank out) |
| `/fund-transfers` | Treasury transfers between own accounts |
| `/cash-register` | Daily cash book with session open/close |
| `/stock` | Stock summary + manual adjust |
| `/stock-ledger` | Stock movement ledger with filters |
| `/customer-ledger`, `/customer-ledger/:id` | Customer ledger |
| `/supplier-ledger`, `/supplier-ledger/:id` | Supplier ledger |
| `/account-ledger`, `/account-ledger/:id` | Account ledger (Bank / Wallet / Cash / Capital / Credit) |
| `/financials` | 4-tab financial statements |
| `/incentives` | Incentives — Targets / Progress / Awards tabs |
| `/backup` | Backups — manual snapshot, history, schedule, overdue reminder |
| `/audit-log` | Audit log — superuser only — every entity insert/update/delete with CSV/PDF export |
| `/error-log` | Error / exception log — superuser only — every error response captured by the global Nest filter, with CSV/PDF export |
| `/users` | Users hub → **Info** (superuser only — user CRUD) |
| `/users-allow-access` | Users hub → **Allow Access** (superuser only — pending access requests) |
| `/users-recent-login` | Users hub → **Recent Login** (superuser only — sign-in events) |
| `/users-change-password` | Users hub → **Change Password** (everyone changes own; admin can also reset others) |
| `/login` | Sign-in screen (also hosts the "Request access" sign-up form) |
| `/print/sale/:id`, `/print/purchase/:id` | Print-friendly invoice/bill |

---

## Testing

```bash
cd erp-backend && npm test           # 82 tests, ~6 seconds
cd erp-backend && npx jest --coverage
```

Tests use an isolated in-memory SQLite TypeORM data source per spec (`src/testing/test-db.ts`) — no Supabase calls.

### Coverage on tested services

| Service | Line % | What's covered |
|---|---:|---|
| `stock.service` | **100%** | IN/OUT recording, on-hand math, OUT validation, summary, adjustments, listMovements |
| `pos.service` | 96% | Session lifecycle, cart stacking on re-scan, partial-pay receivables, CREDIT-customer guard, accountId attribution, outbox event |
| `categories.service` | 93% | Tree build, self-parent/cycle prevention, sub-categories, delete |
| `sales.service` | 91% | Transactional integrity, COGS, discount/paid math, partial pay, outbox enqueue + skipOutbox |
| `purchases.service` | 91% | Same as sales (purchase side) |
| `items.service` | 90% | SKU/barcode uniqueness, barcode-first lookup, M2M category attachment |
| `reports.service` | 88% | Customer + supplier ledgers, A/R, A/P, balance sheet equation, income statement, cash flow, equity reconciliation |
| `outbox.service` | 75% | Enqueue and pending-list |
| `sync.service` | 59% | Inbound event handling, idempotency (DUPLICATE), POS event routing, FAILED records (cron worker not exercised — would require axios mocking) |

Untested (intentional): thin CRUD services for `accounts`, `brands`, `customers`, `suppliers`, `stores`, `payments`, `returns`. They follow the same pattern as `categories.service` (93%).

---

## Deployment options

### Quickest path (current state)
- Backend + frontend run on the cashier's PC (offline-capable when wrapped in Electron)
- Local SQLite, or Supabase if `DATABASE_URL` is configured

### Public web app (for showing it to anyone)
- **Cloudflare Tunnel** — `cloudflared tunnel --url http://localhost:3000` gives you a public HTTPS URL while your PC is online. Quick demo, no server needed.

### Production cloud
- **Frontend** → Vercel or Netlify (static `build/` output, set `REACT_APP_API_BASE_URL` to the cloud backend URL at build time)
- **Backend** → Render / Fly.io / Railway / a small VPS; points at the same Supabase
- **Local shop PC** → Electron build with `CLOUD_SYNC_URL` set to the deployed backend's `/api/sync/push`

---

## Project conventions

- **Access control** — every request is gated by a session-token auth guard except `/auth/login`, `/auth/request-access`, `/health`, and `/sync/push`. Two roles: SUPERUSER (admin only — can manage users, view audit / error logs) and USER (everything else, including backups). Default superuser is `admin` / `Tech@123` — change it on first login. POS session's `userId` field is still unwired by design (the POS terminal is a shared device — see [pos.module.ts](erp-backend/src/modules/pos/pos.module.ts))
- **Sidebar discipline** — new master-data entities → tile in `/master`, new transaction types → tile in one of the four `/transactions` groups (Sales / Purchases / Money / Treasury). Cash Book and Incentives are sidebar-level because they're cross-cutting tools, not single transaction types. Singleton sidebar sections render without a category header.
- **Idempotent sync** — every outbound event has a client-generated UUID; the cloud receiver returns `DUPLICATE` (with the prior result id) if the same ID arrives twice
- **Voucher numbers** — auto-generated, not gap-free (`count + 1`). Prefixes: `INV-` sales, `BILL-` purchases, `SR-`/`PR-` returns, `RCT-` receipts, `PMT-` payments, **`TRF-` fund transfers**. Replace with a sequences table if strict sequencing matters
- **Item identity** — Model No. is the item's name. The frontend hides the legacy `name` and `sku` fields in the standard form; the backend auto-fills `name = modelNo` and `sku = modelNo` (suffixed on collision) when they aren't supplied. SKU is preserved as the internal unique code for backwards compatibility and POS barcode-or-SKU lookup; users only touch it via the form's "Advanced" toggle.
- **Close vs Delete** — items, customers, and suppliers all support a Close (set `isActive = false`) action that hides them from new transactions while preserving their full ledger history. Use Delete only for records created in error.
- **Delete = safe** — every master-data delete (items, customers, suppliers, brands, stores, accounts) is wrapped in `deleteOrConflict` ([erp-backend/src/common/delete-guard.ts](erp-backend/src/common/delete-guard.ts)) which catches DB foreign-key violations (Postgres `23503` / SQLite `FOREIGN KEY constraint failed`) and turns them into a friendly 409 telling the user to use Close instead. No more silent 500 Internal Server Error when trying to delete a row that's still referenced by a sale, purchase, payment, or stock movement.
- **Quick-search bar everywhere** — Items, Brands, Stores, Accounts, Customers, Suppliers, Categories, and Stock Summary all have a "Quick search" input at the top that filters the list as you type. CrudPage exposes `searchKeys={[...]}` so each entity controls which fields it searches.
- **TypeORM columns** — snake_case in DB via `name: 'foo_bar'`, camelCase in entity. `.orderBy()` must use the camelCase property name. Use `type: 'timestamp'` for datetime columns — Postgres rejects `'datetime'`.
- **Account types** — five flavours: **CASH** (physical till), **BANK** (current/savings), **WALLET** (Easypaisa/JazzCash), **CAPITAL** (owner's contributed equity), **CREDIT** (credit card or credit line — surfaces on the balance sheet as a liability when balance is negative).
- **Cash register sessions** — open one per shop-day. Opening flow optionally books a FundTransfer atomically (Capital → Cash to cover shortfall). New cash-book entries are blocked client-side once a session is CLOSED.
- **Profit accounting** — `netIncome` is the trading result; `adjustedNetIncome = netIncome + incentive awards in period`. The Statement of Changes in Equity reconciles against `adjustedNetIncome`.
- **No migrations yet** — `synchronize: true`. Replace with TypeORM migrations before treating Supabase as production

See [CLAUDE.md](./CLAUDE.md) for the AI-assistant guide with deeper conventions and "don'ts".
