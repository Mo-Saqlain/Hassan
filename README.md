# Hassan Electronics — Home-Appliances ERP & POS

Offline-first ERP with an integrated Point-of-Sale terminal for a small home-appliances retail shop. Inventory, master data, vouchers, customer/supplier ledgers, a daily cash register with session-based opening, fund transfers between owner accounts (Capital ↔ Cash ↔ Bank ↔ Credit), an incentive-tracking system that feeds adjusted-net-income, and a four-statement financials report — all backed by Supabase Postgres in the cloud, with a desktop Electron build that bundles a local SQLite for true offline cashier operation.

![Status](https://img.shields.io/badge/status-Phase%201%20%2B%202%20%2B%203%20complete-brightgreen)
![Tests](https://img.shields.io/badge/tests-77%2F77%20passing-success)
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
- **Barcode / SKU scan** — single input that auto-focuses; barcode matches first, then SKU
- **Cart** with re-scan stacking (scanning the same item again increments the existing line)
- **Inline quantity** +/− buttons, line remove, clear cart
- **Payment methods**: Cash, Card, Bank, Credit
- **Partial payment** — paid amount can be less than net; the remainder becomes outstanding on the customer's ledger
- **Change due** — paid amount over net shows change owed to customer
- **In-flow customer create** — `+` button next to the customer dropdown opens a modal; saves and auto-selects on close
- **Session lifecycle** — Start session → ring up sales → Close session. Running `salesTotal` and `salesCount` displayed
- **Receipt printing** — every checkout shows a "Print receipt" link to a print-friendly route that auto-fires the browser's print dialog

### 2. Master Data (consolidated)
One sidebar entry, seven tiles:

| Tile | Entity | Notes |
|---|---|---|
| Items | `items` | unique SKU, optional unique barcode, brand FK, M2M categories, prices, unit, min-stock level |
| Categories | `categories` | self-referencing tree (sub-categories), cycle-protected |
| Brands | `brands` | simple name + description |
| Customers | `customers` | name + contact + opening balance + **live computed balance** |
| Suppliers | `suppliers` | same shape as customers, A/P side |
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
- **Stock Summary** — every item's current on-hand quantity vs minimum, with Low/OK status
- **Stock Ledger** — every IN/OUT movement, filterable by item, category, brand, supplier, and date range, with running balance per row
- **Manual adjustment** — `POST /api/stock/adjust` allows write-off / count correction

### 5. Ledgers
- **Customer Ledger** — chronological list of every sale, sale return, payment-at-sale, and receipt voucher for one customer, with Debit / Credit / running Balance columns. A positive balance means the customer owes you.
- **Supplier Ledger** — same, liability-side. A positive balance means you owe the supplier.

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

### 10. UX / UI
- **Branded** — "Hassan Electronics · Home Appliances" with custom logo mark (gradient + lightning bolt)
- **Light & Dark theme** — toggle in the sidebar footer; preference persisted in `localStorage`, initial theme honours `prefers-color-scheme`. No flash on load (theme bootstrap script in `index.html` runs before React)
- **Responsive** — sidebar collapses to a 72px icon-only rail on desktop; turns into an off-canvas drawer with hamburger on mobile (≤ 768px)
- **Colored icons** — every nav item and master-data/transaction tile has its own colored SVG icon badge
- **Fonts** — Plus Jakarta Sans (display) + Inter (body) loaded from Google Fonts

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
   └─ reports/            # read-only: ledgers, stock ledger, 4 financial statements (consumes IncentivesService + FundTransfersService)
```

### Frontend page map

```
src/
├─ App.js, App.css, index.css, index.js
├─ api/client.js          # axios instance; resolves API host from window.location.hostname
├─ theme/ThemeContext.js  # data-theme attr + localStorage
├─ hooks/useResource.js   # tiny GET-list hook
├─ components/
│  ├─ Layout.js           # sidebar + main, collapsible + mobile drawer
│  ├─ Brand.js            # logo mark
│  ├─ Icon.js             # SVG icon library (25 icons)
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
   └─ InvoicePrint.js     # auto-print invoice route
```

### Sidebar layout

Single-item sections render without a header; multi-item sections keep their label:

- **(no header)** Dashboard, POS Terminal, Master Data, Transactions, Cash Book
- **Inventory** — Stock Summary, Stock Ledger
- **Ledgers** — Customer Ledger, Supplier Ledger
- **Reports** — Financial Statements, Incentives

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
| `/master` | Master Data hub (7 tiles) |
| `/transactions` | Transactions hub (grouped: Sales / Purchases / Money / Treasury) |
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
| `/financials` | 4-tab financial statements |
| `/incentives` | Incentives — Targets / Progress / Awards tabs |
| `/print/sale/:id`, `/print/purchase/:id` | Print-friendly invoice/bill |

---

## Testing

```bash
cd erp-backend && npm test           # 77 tests, ~8 seconds
cd erp-backend && npx jest --coverage
```

Tests use an isolated in-memory SQLite TypeORM data source per spec (`src/testing/test-db.ts`) — no Supabase calls.

### Coverage on tested services

| Service | Line % | What's covered |
|---|---:|---|
| `stock.service` | **100%** | IN/OUT recording, on-hand math, OUT validation, summary, adjustments, listMovements |
| `pos.service` | 96% | Session lifecycle, cart stacking on re-scan, partial pay, checkout, outbox event |
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

- **No auth** in any phase — `userId` on `pos_sessions` is nullable and unwired
- **Sidebar discipline** — new master-data entities → tile in `/master`, new transaction types → tile in one of the four `/transactions` groups (Sales / Purchases / Money / Treasury). Cash Book and Incentives are sidebar-level because they're cross-cutting tools, not single transaction types. Singleton sidebar sections render without a category header.
- **Idempotent sync** — every outbound event has a client-generated UUID; the cloud receiver returns `DUPLICATE` (with the prior result id) if the same ID arrives twice
- **Voucher numbers** — auto-generated, not gap-free (`count + 1`). Prefixes: `INV-` sales, `BILL-` purchases, `SR-`/`PR-` returns, `RCT-` receipts, `PMT-` payments, **`TRF-` fund transfers**. Replace with a sequences table if strict sequencing matters
- **TypeORM columns** — snake_case in DB via `name: 'foo_bar'`, camelCase in entity. `.orderBy()` must use the camelCase property name. Use `type: 'timestamp'` for datetime columns — Postgres rejects `'datetime'`.
- **Account types** — five flavours: **CASH** (physical till), **BANK** (current/savings), **WALLET** (Easypaisa/JazzCash), **CAPITAL** (owner's contributed equity), **CREDIT** (credit card or credit line — surfaces on the balance sheet as a liability when balance is negative).
- **Cash register sessions** — open one per shop-day. Opening flow optionally books a FundTransfer atomically (Capital → Cash to cover shortfall). New cash-book entries are blocked client-side once a session is CLOSED.
- **Profit accounting** — `netIncome` is the trading result; `adjustedNetIncome = netIncome + incentive awards in period`. The Statement of Changes in Equity reconciles against `adjustedNetIncome`.
- **No migrations yet** — `synchronize: true`. Replace with TypeORM migrations before treating Supabase as production

See [CLAUDE.md](./CLAUDE.md) for the AI-assistant guide with deeper conventions and "don'ts".
