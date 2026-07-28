# Hassan Electronics — Home-Appliances ERP & POS

Offline-first ERP with an integrated Point-of-Sale terminal for a single home-appliances retail shop. Inventory, master data, vouchers, customer / supplier / employee / account ledgers, a daily cash register with session-based opening, fund transfers between owner accounts (Capital ↔ Cash ↔ Bank ↔ Wallet ↔ Credit), a manufacturer-incentive engine that feeds adjusted-net-income, daily JSON backups with verify + restore, the four standard financial statements, a true double-entry journal with period locking, and access control with a single superuser who approves new users. The same backend codebase runs locally against SQLite (desktop install) or against Supabase Postgres in the cloud. Designed to keep selling even when the internet is down — sales queue up locally and sync to the cloud (HMAC-signed) when the cashier clicks the Sync button.

![Status](https://img.shields.io/badge/status-Phase%201--5%20shipped-brightgreen)
![Tests](https://img.shields.io/badge/tests-157%20Jest%20specs-success)
![Backend](https://img.shields.io/badge/backend-NestJS%2011%20%2B%20TypeORM%200.3-e0234e)
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
10. [Mobile app (read-only Android)](#mobile-app-read-only-android)
11. [Backups](#backups)
11. [CSV import & data migration](#csv-import--data-migration)
12. [Testing](#testing)
13. [Project conventions](#project-conventions)
14. [Roadmap — shipped & out of scope](#roadmap--shipped--out-of-scope)

---

## What this is

A retail ERP for a single-store shop selling home appliances. The cashier rings up sales through a barcode / model-no driven POS terminal, or enters bill-book vouchers by hand. The same database tracks purchases from suppliers, stock movements, customer credit, supplier dues, employee payroll + incentives, repairs, deliveries, and produces the four standard financial statements plus aging and profitability reports — all backed by a parallel double-entry journal.

Everything is **offline-first**: the cashier can keep selling when the internet is down. Sales, purchases, payments, stock movements, and POS sessions queue up locally in an outbox table and sync to the cloud when the user triggers a sync.

The UI follows a deliberate **flat Windows 10** direction — Segoe UI system fonts, sharp 90° corners (no border-radius), 1px borders, solid surfaces, no glass / blur / aurora / animation. Built for low-end shop PCs while still feeling modern.

The backend has **36 NestJS feature modules** owning **48 entities** (plus an abstract `BaseEntity` and a `Setting` key/value store), wired in `app.module.ts`.

---

## Functional features

### 1. Point of Sale (POS)
The POS terminal is a server-side session: the cart lives in `pos_cart_items` (local SQLite) and is cleared on checkout. (`/pos` is still mounted but no longer has a sidebar entry — Sales Voucher is the default Sales-hub tab now; reach POS by typing the URL.)

- **Model-number scan** — single auto-focused input. Backend matches barcode first, then SKU, then model-no. UI placeholder reads *"Type model no. — e.g. DAWLANCE LVS-15"*.
- **Cart with re-scan stacking** — scanning the same item again increments the existing line and overwrites its price with the latest (no duplicate rows; enforced by the `sessionId + itemId` composite index).
- **Inline quantity** +/− buttons, line remove, clear cart.
- **Payment methods**: Cash, Card, Bank, Credit.
- **Receiving account picker** — on every CASH / CARD / BANK sale the cashier picks which cash drawer / bank / wallet account is being credited. Picker is filtered to `CASH` accounts for cash sales and to `BANK + WALLET` for card / bank transfers; if exactly one account is eligible it auto-selects. The sale's paid amount flows through `/reports/account-ledger/:id`, the Balance Sheet, and the Cash Flow statement against the chosen account — so a Rs 50,000 card-tap sale credits the correct HBL account, not a generic "cash" bucket. CREDIT sales don't ask for an account — `paidAmount` is forced to 0 and `accountId` is stripped (nothing is collected yet).
- **Partial payment + Booking Hold** — paid amount can be less than net; the remainder becomes a customer receivable. Selecting a customer is required for partial pay and for CREDIT sales (frontend + backend enforce this). When the sale carries serialised items, partial-pay (`dueAmount > 0.005`) flips the unit's `allocationStatus` to **BOOKED** instead of DELIVERED — the goods are reserved on the floor until balance is cleared. The success banner offers immediate **"Print booking hold slip"** + **"Print box tag"** links so the cashier can tape a 4×6 RESERVED tag to the unit before the customer leaves. See §4 Inventory for the full state machine.
- **Serial capture at checkout** — items with `tracksSerials` show a per-line serial textarea (newline / comma separated). When `serialRequiredOnSale` is true, the entered count must equal the line quantity or checkout blocks; when false, it must be either zero or exactly the quantity (all-or-none); whitespace-only entries are trimmed away; duplicates within a row are rejected. The same rules run client-side and on the server.
- **POS keyboard shortcuts** — `F2` focus scan input · `F4` focus customer · `F8` charge · `F9` clear cart. Reduces mouse trips during a busy till.
- **Incentive-aware cost warnings** — when an active manufacturer incentive target is past its trigger threshold, the cart row shows a `+ Rs N/unit incentive` chip and the "below cost" warning is softened to `Below raw cost · incentive covers` when the effective cost (`avgCost − perUnitCredit`) is still met. A solid red `Below cost` warning fires only when even the incentive can't recover the loss.
- **Local serial auto-generation** — items flagged `isInternalGenerated` (unbranded local goods) get a `+ Generate & Print Local IDs` button on the cart row. Click mints N serials in `LOCAL-<CategoryCode>-<Year>-<4-digit-seq>` format and opens up to the first 5 print-label tabs automatically.
- **Customer credit limit** — every Customer carries `creditEnabled` (master switch, **default off**) and `creditLimit` (rupee ceiling). Any sale that would leave `dueAmount > 0` for a customer is rejected by `SalesService.create()` if (a) the customer has `creditEnabled === false`, or (b) the projected outstanding (current A/R + this sale's due) would exceed `creditLimit`. Walk-in / no-customer sales are exempt. Current outstanding is computed the same way the customer ledger computes balance: `openingBalance + sum(sale.dueAmount) − sum(receipts)`.
- **Change due** — when paid > net, the row reads `Change · …`.
- **In-flow customer create** — `+` next to the customer dropdown opens a modal that saves and auto-selects on close.
- **Session lifecycle** — Start session (optional opening float) → ring up sales → Close session. Running `salesTotal` and `salesCount` displayed. Closing a session enqueues a `POS_SESSION_CLOSED` outbox event when cloud sync is configured.
- **Receipt printing** — every checkout shows a Print receipt link that opens a print-friendly route and auto-fires the browser's print dialog. Checkout calls `SalesService.create(..., { skipOutbox: true })` then enqueues its own single `POS_SALE_CREATED` event.

### 2. Master data (hubs)
Master data lives inside the operational hubs in the sidebar, not in a separate "Catalogue" screen. The `MasterData` screen renders a tile grid that switches the active CRUD panel inline; entity sub-routes reuse the same screen with an `entity` prop. Each hub renders its sub-entities as a horizontal tab strip:

| Hub | Tabs |
|---|---|
| Customer | Info · Receipts · Ledger · Warranty · Service |
| Sales | New Voucher · History · Returns · Deliveries · Overdue Bookings |
| Supplier | Info · Brands · Payments · Incentives · Ledger |
| Purchase | Orders · Bills · Returns |
| Item | Catalogue · Categories |
| Stock | Summary · Stores · Ledger · Transfers · Damaged |
| Employee | Info · Attendance · Payments · Incentive Rules · Ledger |
| Account | Info · Transfers · Ledger |
| Users (admin) | Info · Allow Access · Recent Login · Change Password |
| System | Backups · Audit · Errors |

The Customers / Suppliers / Employees grids load from `/reports/*-balances` (computed running balances) so the master list shows live A/R, A/P, and staff-owed figures; CRUD still hits the base entity endpoints.

Every master-data list (Items, Categories, Brands, Customers, Suppliers, Stores, Accounts, Employees) has an **Import CSV** button next to the CSV / PDF export — for bulk-loading records migrated from a previous system. It also offers a one-click blank template. See **[CSV import & data migration](#csv-import--data-migration)** for the exact column schema each table expects.

**Item identifier:** Model No is the primary identifier (used as the item's display name; bulk accessories may have no model number and fall back to a typed name). SKU auto-derives from Model No on save (suffixed `-2`, `-3` … on collision). Barcode is optional and globally unique. **Quick search** at the top of every list filters as you type (`searchKeys={[...]}` per page).

**Accounts:** five user-facing flavours — **Cash**, **Bank**, **Wallet** (Easypaisa / JazzCash), **Capital** (owner's equity), **Credit** (credit card or credit line — shows as a liability on the balance sheet when negative). Plus seven **system accounts** seeded idempotently on boot for the double-entry journal (`Sales Revenue` 4100, `Cost of Goods Sold` 5100, `Inventory` 1150, `Accounts Receivable` 1140, **`Deferred Cash Receivables` 1145**, `Accounts Payable` 2100, `Cash on Hand` 1110) and eight **control nodes** (1000 Assets, 1100 Current Assets, 1200 Fixed Assets, 2000 Liabilities, 3000 Equity, 4000 Revenue, 5000 COGS, 6000 Operating Expenses). System accounts can be renamed but not deleted; control accounts are non-postable.

**Categories** are a self-referencing tree (`parent_id`, cycle-guarded in the service). Each carries an optional uppercase `code` (≤ 8 chars, e.g. `COOLER`, `FAN`, `STAND`) used as the segment of auto-generated local serials: `LOCAL-<code>-<year>-<seq>`. Code uniqueness is enforced in the service layer (app-level, not a DB constraint — a partial-unique index for many NULLs has dialect-specific syntax).

### 3. Transactions
- **POS sales** generate invoices (`INV-…`) with stock OUT — scan-driven session/cart flow at `/#/pos`.
- **Sales Voucher** (`/#/sales-voucher`, default Sales-hub tab) — bill-book entry screen + `POST /sales/voucher`, built entirely client-side and posted atomically. Customer header with **inline `+ New customer`** (POST /customers without leaving the voucher), scan-to-add input (barcode / SKU / model no via `/items/lookup` — stacks qty on the same row if scanned twice at the same price), line table (qty / unit price), per-line **tracked-serial entry** that appears for items with `tracksSerials=true` (one serial per unit, paste-multiline supported; count must equal qty when `serialRequiredOnSale=true`, else all-or-none), N payment splits with two flavours — **CASH** (Cash + Bank + Wallet — posts a `RCT-…` Receipt + journal pair) and **CUSTOMER_CREDIT** (uses the customer's existing on-account credit to settle part of the bill; surfaced in the split dropdown as "Customer credit · available X.XX" only when the picked customer has a negative balance; capped at the available credit; reduces `Sale.dueAmount` without creating a Payment row or journal entry — the prior advance Receipt already moved cash and credited A/R, so re-posting would double-count), live Net / Paid / Residual footer, and an optional **Deferred-cash schedule** that appears when residual > 0 (rows of `{ dueDate, expectedAmount, notes }`; sum must clear the residual — when on, the residual routes to `Deferred Cash Receivables (#1145)` so the dashboard can chase each due date). Keyboard shortcuts: **F2** focuses the scanner, **Ctrl+Enter** submits. Submit posts one Sale (created `CREDIT` / `paidAmount 0`) + N Receipt rows in a single atomic transaction; serial state flips inside the same transaction via the booking-hold state machine — full pay (`dueAmount = 0`) → `bindToSale` per serial (DELIVERED + warranty stamp from the Item template), residual remains → `reserveForBooking` (BOOKED, physical `status` stays IN_STOCK). An oversplit, a serial-count mismatch, or a stale account id rolls the whole submission back so a partial sale can't strand. A `SALE_VOUCHER_CREATED` outbox event is enqueued when cloud sync is configured. After save the printable invoice opens in a new tab and the cashier is dropped onto Sales history.
- **Sale returns** (`SR-…`) — goods back from customers, stock IN; per-line serials flip back to `RETURNED` (best-effort)
- **Purchases** (`BILL-…`) — stock IN from suppliers; rolls weighted-average `avgCost`; optional per-line serial intake (count need not match qty); in-flow `+ New` button to create items mid-purchase
- **Purchase returns** (`PR-…`) — goods returned to suppliers, stock OUT
- **Receipts** (`RCT-…`) — money in from customers (direction `IN`)
- **Payments** (`PMT-…`) — money out to suppliers (direction `OUT`)
- **Fund transfers** (`TRF-…`) — move money between your own accounts (Capital → Cash, Cash → Bank, Bank → Credit, etc.)
- **Purchase orders** (`PO-…`) — Draft → Sent → Received → Cancelled workflow; a pure planning document with no stock / journal / outbox impact (receipt of goods is a separate Purchase).
- **Reversals** — `POST /sales/:id/reverse`, `/purchases/:id/reverse`, `/payments/:id/reverse`, `/fund-transfers/:id/reverse` (see §12). Returns / vouchers themselves are immutable history from the UI.

All voucher numbers are auto-generated `<PREFIX>-NNNNNN` via `SequenceService` (`count + 1` seed; not gap-free).

### 4. Inventory
- **Stock Summary** — per item: `onHand` (derived `SUM(IN − OUT)`, never stored), `reserved` (`Item.reservedQty`, promised to a pending delivery), `available = onHand − reserved` (floored at 0), `avgCost` (running weighted-average), `valueAtCost`, Low/OK status. Reserved is the figure the POS path respects; on-hand is the physical count.
- **Append-only stock ledger.** Every movement is a `stock_movements` row tagged with a `referenceType` (`PURCHASE`, `SALE`, `PURCHASE_RETURN`, `SALE_RETURN`, `ADJUSTMENT`, `SALE_REVERSAL`, `PURCHASE_REVERSAL`). All mutations funnel through `StockService.recordMovement`, the single point that enforces positive quantity and throws `BadRequestException` if an OUT would drive on-hand negative — rolling back the surrounding transaction.
- **Weighted-average inventory costing.** Every purchase rolls the running `avgCost` and `costedQty` on the Item via `newAvg = (oldQty × oldAvg + inQty × unitCost) / (oldQty + inQty)`. Sales snapshot `avgCost` onto the `SaleItem.costAtSaleTime` column and post COGS using that frozen value — historical margins never shift retroactively. Returns and reversals adjust `costedQty` symmetrically and then **recost**: `RecostService` replays the item's surviving purchases, sales and returns to re-derive `avgCost` from scratch, starting from the item's opening cost basis (`openingAvgCost` / `openingCostedQty`). That replaces the old accepted inaccuracy — a running average can't be un-rolled, so reversing a mis-priced bill used to leave `avgCost` overstated until later purchases diluted it. Because cost is now a pure function of the documents that survive, a wrong voucher can be reversed (and in future edited) and the cost basis simply follows. The Item's `purchasePrice` is kept as a UI-only "latest-cost reference"; **it's never consulted for COGS again**. Selling below `avgCost` is allowed (relationship pricing is normal) — the POS just flags the line with a non-blocking warning.
- **Reserved inventory.** The Delivery module increments `Item.reservedQty` when a delivery's status is PENDING / OUT_FOR_DELIVERY / INSTALLATION_PENDING, and releases it on DELIVERED / INSTALLED / CANCELLED. The reservation overlay is a no-op for "loose" deliveries with no linked sale. The Stock Summary's `available` column reflects this so the cashier never sells a unit that's already loaded on the truck.
- **Per-unit booking-hold state machine.** `ItemSerial.allocationStatus` has three values that run orthogonal to the physical `status` (IN_STOCK / SOLD / RETURNED / DAMAGED / WRITE_OFF):
  - `AVAILABLE` — free for sale to any cash customer.
  - `BOOKED` — held by a partial-payment sale. Physically on the floor (status stays IN_STOCK) but reserved by `saleInvoiceNo` + `bookedAt`.
  - `DELIVERED` — fully paid and handed over (or sold cash-and-walk).

  Transitions are atomic via `ItemSerialsService.reserveForBooking()` / `releaseBooking()` / `markDelivered()` / `bindToSale()` / `unbindFromInvoice()`, each accepting an optional `EntityManager` so the caller can enlist them in its own transaction. `PosService.checkout()` and the Sales Voucher branch on `dueAmount > 0.005`: partial-pay sales call `reserveForBooking` (BOOKED); full-pay sales call `bindToSale` (DELIVERED + warranty stamp). When the last commitment settles via `POST /sales/:id/settle-commitment`, the serials flip BOOKED → DELIVERED automatically. **Strict Delivery Handover Authorisation**: `DeliveriesService.update()` throws if the linked sale still has `dueAmount > 0` when status transitions to DELIVERED — the catastrophic "took the AC home then disputed the bill" failure mode is structurally closed. This guard is gated solely on `Sale.dueAmount > 0.005` (no extra conditions, by design). The warranty-lookup page surfaces a top-priority amber "On hold · payment pending" chip so the floor cashier instantly sees DO NOT SELL.
- **Overdue Bookings dashboard** (Sales-hub tab `/overdue-bookings`) — every sale with at least one BOOKED serial older than N days (default 7). **Release to Floor** (`POST /sales/:id/release-booking`) cancels the booking and reverts BOOKED → AVAILABLE; it reuses the reversal pipeline (idempotent) with a `RELEASE-TO-FLOOR ·` audit prefix. Advance amount stays as customer credit — never auto-refunded; the owner refunds manually via a Receipt reversal.
- **Local serial auto-generation** — items flagged `isInternalGenerated` mint serials in `LOCAL-<CategoryCode>-<Year>-<4-digit-seq>` via `POST /item-serials/generate-local`. Sequence keyed per (category-code, year) in the `sequences` table; Jan 1 resets. The item's category must have a `code`. Print route `/print/serial-label/:serial` produces a 2"×1" thermal-sticker layout — placeholder barcode-style bars + serial + item name (no real barcode library yet — swapping in `jsbarcode` is one component change).
- **Stock Ledger** — every IN / OUT movement, filterable by item / category / brand / supplier / date range, with running balance per row.
- **Reason-driven manual adjustment** — `POST /api/stock/adjust`. The frontend never asks the user to pick "IN" or "OUT" directly; they pick a **reason** (`Loss / stolen`, `Damaged`, `Found`, `Stock count — was over / under`, `Correction +/−`) and the direction follows. Form shows current on-hand and the projected new on-hand, blocks submission if the adjustment would drive stock negative.
- **Stock transfers** (`STK-TRF-…`) — atomic inter-store transfer: one OUT at the source store + one IN at the destination, in a single transaction (if the OUT is short, the whole thing rolls back). Disabled in the UI with fewer than two stores.
- **Damaged goods** (`DMG-…`) register — DAMAGED / IN_REPAIR / WRITE_OFF → REPAIRED workflow. Creation books an immediate stock OUT; flipping to REPAIRED books a reversing IN so items rejoin sellable inventory. A record still out-of-stock can't be deleted (must be REPAIRED first so the stock reverses).

### 5. Ledgers
All ledger balances are server-computed (the reports API returns `openingBalance` / `closingBalance` and a per-row running `balance`); the frontend `LedgerView` only renders them.

- **Customer Ledger** — chronological sale / sale-return / payment-at-sale / receipt rows with Debit / Credit / running Balance. Positive balance = customer owes us. An `AgingPanel` (per-invoice aging detail, with a Past-Promise column) sits above it.
- **Supplier Ledger** — purchase / purchase-return / payment rows; symmetric `AgingPanel` (bills, no promise column).
- **Employee Ledger** — salary accruals (debit = we owe) / payments / advances / reimbursements / earned incentives, with running balance and an "Incentives earned this period" figure. Positive balance = we owe the employee.
- **Account Ledger** — every cash / bank / wallet movement (sales paid, payments out, fund transfers, legacy null-account cash sales for CASH accounts) against one specific account, `asOf`-filtered, grouped by account type in the picker.
- **All-balances pages** — single GROUP-BY queries that return the closing balance for every customer / supplier / employee / account at once (avoids N+1 over per-row ledgers).

### 5b. Delivery & Service workflow (appliance-retail specifics)
- **Deliveries** (`DLV-…`, `/deliveries`, also a Sales-hub tab) — operational tracking of truck-out / installation handover. Stock is already deducted at sale time, so the only inventory effect is the `reservedQty` overlay (see §4). Six statuses: PENDING / OUT_FOR_DELIVERY / DELIVERED / INSTALLATION_PENDING / INSTALLED / CANCELLED. Auto-fills customer + address + phone from the linked sale's customer record. A `FunnelStages` chart and a status tally summarise the pipeline.
- **Service tickets** (`SVC-…`, `/service-tickets`, Customer-hub tab) — seven statuses RECEIVED → SENT_TO_COMPANY → WAITING_PARTS → UNDER_REPAIR → READY_FOR_PICKUP → DELIVERED, plus UNREPAIRABLE (terminal). Optional serial link auto-pulls the in-warranty flag from the warranty endpoint; a receipt-number lookup does the same for model-only units (no serial) by attaching the originating sale line (`saleItemId`). `inWarranty` is a snapshot at ticket-open time. Status tally tiles + a `FunnelStages` chart summarise the queue.

### 6. Cash Register
A real cashier's day book.
- **One session per shop-day** — enforced by a unique index on `session_date`. Opened with an `actualOpening` count; the opening flow optionally books a Capital → Cash `FundTransfer` atomically (shared transaction) to cover any shortfall, storing its id on `openingTransferId`.
- **Cash-book entries** — small expenses, wallet top-ups, miscellaneous in / out (`EXPENSE`, `MISC`, `OPENING`, `CLOSING_ADJUSTMENT`, `OTHER`). Blocked client-side once the session is CLOSED.
- **Daily book** — consolidates cash-affecting sales (`CASH`, paid > 0), cash purchases, cash payment vouchers, and cash-book entries into one running-balance view (inter-cash fund transfers net to zero and are excluded). A MISC-warning fires when miscellaneous throughput is meaningfully large (≥ Rs 1000 and > 10% of the day's throughput).
- **Daily closing** — denomination-counter modal lists every standard Pakistani note (Rs 5000 / 1000 / 500 / 100 / 50 / 20 / 10), the cashier types counts per row, the modal auto-sums to `actualClosing` (with a manual-override field). The variance vs expected closing colour-codes red (short) / green (over). Counts are persisted as JSON on the session so a "two 5000s short" investigation is one click away. **Variance is recorded numerically only** — open/close post no journal or stock side effects; the register is reconciliation, not posting. A 30-session variance-trend mini-chart highlights persistent drift.

### 7. Incentives & Adjusted Profit
- **Supplier / brand incentive targets** — sell N units of an item or brand between dates to unlock a bonus. The shop sometimes sells at a per-unit loss because clearing the target unlocks an incentive that exceeds the loss — so true profit must include incentives.
- **Effective-cost adjustment from triggered targets** — every target carries a `triggerThresholdPct` (default 80). Once net-sold qty crosses that percentage of `targetQuantity`, the per-unit incentive credit (`incentiveAmount / targetQuantity`) is treated as a likely earnback. `GET /incentives/cost-adjustments` returns the per-item credit map (recomputed live — never snapshotted onto a sale). POS uses it to:
  - Show a blue `+ Rs N/unit incentive` chip on the cart row when an active credit applies.
  - Soften the "below cost" warning: amber `Below raw cost · incentive covers` when unit price < `avgCost` but ≥ `avgCost − perUnitCredit`; solid red `Below cost` only when even the incentive can't recover.

  Brand-basis targets propagate the credit to every item in the brand. If multiple active+triggered targets touch the same item, the bigger credit wins (the cashier sees the best available recovery).
- **Awards** — booked (`POST /incentives/awards`) when the target is achieved and the supplier pays out. The Income Statement adds the sum of awards in the period to net income to produce **Adjusted Net Income**.
- **Employee incentive rules** — a percentage of qualifying sale lines (basis `ALL_SALES` / `CATEGORY` / `ITEM` / `BRAND`, optional date range). Multiple rules stack — each emits its own ledger line and they sum independently; returns net out as negative adjustment rows. Earned incentives flow into the employee ledger via `computeForPeriod`. (Note: the employee-incentive `IncentiveBasis` union differs from the supplier-target one.)

Both incentive engines are pure read-derivation off Sales / Returns / Items — neither writes Sale / Stock / Journal / Serial state; awards are the only manually-booked records.

### 8. Reports — four financial statements + ledgers + aging + profitability
`ReportsModule` is **read-only** by design — no writes allowed inside it.

- **Income Statement** — Revenue → COGS → Gross Profit → Operating Expenses (incl. employee incentives) → Net Income → Incentive Awards → Adjusted Net Income.
- **Balance Sheet** — Assets (cash, bank, wallet, inventory, A/R) | Liabilities (A/P, credit lines) + Equity (Capital contributed + Retained Earnings). `asOf` filterable.
- **Cash Flow Statement** — direct-method operating cash movement, including fund-transfer deltas per account.
- **Statement of Changes in Equity** — Opening + (Adjusted) Net Income − Drawings = Closing, with a reconciliation balance check.
- **Stock Ledger** with category / brand / supplier / date filters and running balance.
- **A/R aging** (`GET /reports/ar-aging?asOf=…`) — for every customer with an outstanding balance, residual amounts bucketed 0-30 / 31-60 / 61-90 / 90+ days. Receipts are consumed FIFO against the oldest unpaid sale; opening balance is treated as oldest and consumed first. Each row also carries:
  - `pastPromise` overlay flagging residuals where a commitment in `paymentCommitments` is past its `dueDate` — surfaces missed "pay half on the 20th" promises that would otherwise hide inside the 0-30 bucket.
  - `maxDaysElapsed` + `oldestUnpaidDate` — the age of the customer's oldest unpaid invoice.
  - `daysSinceFirstPastPromise` — for AR rows only, how long ago the earliest broken PENDING commitment was promised (different from `maxDaysElapsed` — a fresh invoice can carry an ancient broken promise).
- **Per-invoice / per-bill aging detail** — `GET /reports/ar-aging/:customerId` and `/ap-aging/:supplierId` return per-document rows with `daysElapsed`, `residualAmount`, `hasPendingCommitment`. Surfaced as an `AgingPanel` above the per-party ledger and feeds the "Oldest unpaid: 47d (Ali Khan)" line on the Dashboard's Receivables/Payables card.
- **Deferred-cash commitments on sales** — POS and the voucher capture structured `paymentCommitments: [{ dueDate, expectedAmount, status }]` for credit / partial-pay invoices. Residual lands on the dedicated **Deferred Cash Receivables** system account (`#1145`) rather than open A/R. `POST /sales/:id/settle-commitment` posts a Receipt voucher and books the second journal half (Dr Cash / Cr Deferred Receivables), caps at the commitment's residual and surfaces any overflow to the caller. `GET /sales/deferred/upcoming` powers the dashboard widget — every PENDING commitment due within 7 days, overdue-flagged.
- **A/P aging** (`GET /reports/ap-aging?asOf=…`) — symmetric for suppliers: unpaid purchases minus payments-out, bucketed by age.
- **Item profitability** (`GET /reports/item-margins?from=…&to=…`) — qty sold, revenue, COGS (using the **weighted-average cost snapshotted on each sale line at sale time** — historical margins never shift retroactively), gross profit, margin %.
- **Slow-moving stock** (`GET /reports/slow-moving-stock?asOf=…`) — for every active item still on hand, days since last sale + value at avg cost, bucketed fresh / slowing / cold / dead (>90 days or never sold). Summary surfaces total locked value in dead + cold stock — the "what's tying up cash" report.
- **Margin analytics** (`GET /reports/margin-analytics?from=…&to=…`) — three slices: by-brand roll-up (qty / revenue / COGS / margin %), 20 lowest-margin sale lines (spot pricing leaks), 20 highest-discount sales (spot relationship-pricing patterns). Observation only — the system never restricts a price the salesman enters.
- **Journal-derived reports (parallel ledger)** — `GET /reports/trial-balance?asOf=…`, `/income-statement-from-journals`, `/balance-sheet-from-journals` aggregate `journal_lines` directly and ship alongside the operational-table reports so a reconciliation tool can diff them. Each carries a `balanced` flag. See §12.

> **Note on one operational report:** the operational `incomeStatement` / `balanceSheet` still compute inventory + COGS from `item.purchasePrice` as a stand-in (no per-batch costing in those two paths), whereas `item-margins` and `margin-analytics` use the correct `costAtSaleTime` snapshot. The journal-derived statements are the parity check; the read-side flip lands once a closing cycle proves they match.

### 9. Cloud sync (offline-first, manual trigger, HMAC-signed)
- Every business transaction at the local node enqueues an event in the `sync_queue` outbox table via `OutboxService.enqueue` (`SALE_CREATED`, `SALE_VOUCHER_CREATED`, `PURCHASE_CREATED`, `POS_SALE_CREATED`, `POS_SESSION_CLOSED`). Only `SalesService` / `PurchasesService` / `PosService` produce events, and only when `CLOUD_SYNC_URL` is set.
- **Sync is manual, not scheduled.** There is no `@Cron` — a "Sync" button in the topbar shows the pending count as a badge (polling `GET /api/sync/status` every 30 s), spins while the request is in flight, and toasts the result. Clicking it calls `POST /api/sync/flush`, which drains **every** pending entry (no chunk cap) under a single-flight `isPushing` lock and returns a `{ ok, cloudConfigured, attempted, succeeded, failed, message }` summary. The button hides itself entirely when `CLOUD_SYNC_URL` is not configured. (This is deliberate — the owner asked for manual sync so a flaky link can't bury the till in retry traffic.)
- **Poison-pill isolation.** A single failing event (schema mismatch on the cloud, FK violation, corrupted payload) does NOT stall the queue. The flush loop wraps each event in its own try/catch, flips the failing row to `FAILED` with the server's error text in the `error` column, stamps `lastAttemptAt`, and proceeds. FAILED rows are **not** auto-retried (they'd spam the banner on an intermittent cloud bug); `GET /api/sync/failed` lists them and `POST /api/sync/failed/:id/retry` resets one to PENDING. A network-level failure (not a per-event error) leaves rows PENDING for the next flush but bumps `attempts`.
- The cloud receiver (`POST /api/sync/push`) is **another instance of this same NestJS backend** deployed against Supabase Postgres. It applies events with idempotency by event ID — duplicate event IDs return `DUPLICATE`, never re-applied. `POS_SALE_CREATED` is applied as a normal sale (session metadata stripped); `SALE_VOUCHER_CREATED` replays through `createFromVoucher` (rebuilding the sale + its receipt splits); `POS_SESSION_*` are audit-only no-ops cloud-side. The cloud uses `skipOutbox: true` so it never re-enqueues what it receives (and `createFromVoucher` only re-enqueues when `CLOUD_SYNC_URL` is set, which the terminal receiver doesn't have). So Supabase is always eventually-consistent with what the shop did, with no special online-mode in the cashier UI.
- **HMAC-SHA256 request signing.** The receiver is public on the internet, so unsigned pushes would let anyone forge `SALE_CREATED` events. Each shop is provisioned with `SHOP_ID` + `SHOP_SYNC_SECRET` (32-byte random hex). The local node computes `HMAC-SHA256(secret, "<RFC3339 timestamp>\n<JSON body>")` and sends `X-Shop-Id`, `X-Sync-Timestamp`, `X-Sync-Signature` headers (the JSON body is sent byte-for-byte via an axios `transformRequest` identity so the signature stays valid). The `SyncSignatureGuard` rejects with `401` if any header is missing, the shop id doesn't match, the timestamp is more than 5 minutes off server time (replay window), or the signature doesn't recompute (constant-time compared). The receiver refuses to run at all if `SHOP_ID` / `SHOP_SYNC_SECRET` are unset (no dev bypass); the local node refuses to push if they're unset (no silent unsigned fallback).

### 10. Backups + verification
- **Snapshot every business table** to a single JSON file on local disk. Backed-up tables: every entity except the user/auth tables (`users`, `user_access_requests`, `user_login_events`) and the `backups` table itself — excluded so a backup never injects a superuser or leaks credentials, and never recurses. M2M join tables (e.g. `item_categories`) are included.
- **Manual snapshot** — `System → Backups → Save backup now` (`POST /backup`) writes a snapshot to disk; `Download snapshot` (`GET /backup/download-now`, superuser-only) streams an in-memory snapshot to the browser as a download (no file persisted server-side — useful for USB-stick copies). The frontend downloads through an authed axios blob fetch (not `window.location`, which would lack the auth header and 401).
- **Restore from JSON** — `POST /backup/restore` (superuser + reauth) accepts a multi-megabyte JSON body (Express body limit bumped to 100 MB for this route only). It first takes a **pre-restore safety snapshot**, then wipes and replays every business table inside one transaction with FK enforcement toggled off for the duration. Requires the literal text `RESTORE` plus a one-shot `X-Reauth-Token` (or legacy password).
- **Scheduled daily snapshot** — a `@Cron` runs hourly and snapshots if the configured hour has passed and no backup exists for today (default 20:00, configurable via `POST /backup/schedule`, stored in the `settings` table). Polling hourly (rather than a precise cron) lets the hour change via API without a restart.
- **Storage** — defaults to `apps/erp-backend/backups/` in dev; Electron forces `<userData>/backups`. Tracked in a `backups` table with file path, size, trigger (AUTO / MANUAL), and `sha256`.
- **Integrity verification** — every snapshot row stores a `sha256` hash of the file's bytes at write time. `POST /backup/:id/verify` (superuser-only) re-hashes the file on disk and compares; mismatch surfaces as a red badge on the History page (disk corruption, tampering, edited file). The restore flow runs a verify pass first so a corrupted snapshot never wipes the live DB. Legacy rows written before the column existed get backfilled on the first verify.

### 11. Access control
- **Two roles only** — `SUPERUSER` (admin) and `USER`. No granular RBAC. Seeded admin: `admin` / `Tech@123` on first boot (idempotent).
- **Passwords** — scrypt hashes (`scrypt:saltHex:hashHex`, 64-byte key, 16-byte salt), constant-time verify. scrypt (not bcrypt) avoids native deps on Windows/Electron.
- **Sessions** — opaque server-issued tokens (not JWT), 12-hour **sliding window** (refreshed only when the bump exceeds 60 s, to avoid a DB write per request), one token per user (rotation on login or password change invalidates other devices), sent as `Authorization: Bearer <token>`.
- **AuthGuard** is global (registered in `UsersModule`). Exempt routes: `/auth/login`, `/auth/request-access`, `/health`, `/sync/push` (HMAC-authed instead), and the public warranty lookup `GET /item-serials/warranty/:serial`.
- **Re-authentication** — `POST /auth/reauthenticate` issues a one-shot, 60-second, in-memory `X-Reauth-Token` consumed by high-privilege backup endpoints (restore / download). Deleted on first use even on mismatch (anti-replay); lost on process restart by design.
- **Last-superuser & self protections** — the last active superuser can't be removed / demoted / deactivated; you can't delete or deactivate your own account, or change your own role.
- **Request access flow** — the login page has a "Request access" button. Non-users submit a `UserAccessRequest`; a SUPERUSER reviews and approves (assigning username + password, creating a regular USER) or rejects from `Users → Allow Access`. Requests never auto-create users.
- **Login events** — every successful login appends a `UserLoginEvent` (superuser's own logins pre-marked seen so they don't notify themselves). Surfaced under `Users → Recent Login` (superuser-only) and the topbar login bell; clearing keeps the last 30 days.
- **Entity-change audit log** — `AuditSubscriber` (a TypeORM `EntitySubscriber`, not a DB trigger — cross-dialect safe) logs every INSERT / UPDATE / DELETE on the business tables to `audit_logs` with the entity type, primary key, and a JSON diff of changed fields on UPDATE. User/auth tables, audit/error logs, and outbox rows are skipped to avoid recursion/noise. Surfaced under `System → Audit` (superuser-only).
- **Error log** — a global `ErrorLogFilter` records every error response to `error_logs` (status ≥ 500 → ERROR, 4xx → WARN) while preserving the default response shape. Surfaced under `System → Errors` (superuser-only).

### 12. Double-entry journal & period locking
- **Journal entries** — every sale, purchase, receipt, payment, fund transfer, and commitment settlement posts a balanced `JournalEntry` (header) with two-or-more `JournalLine` rows through `JournalService.post()` **in the same TypeORM transaction as the source row** (it accepts an external `EntityManager`). The service rejects unbalanced entries (`|SUM(debit) − SUM(credit)| > 0.005`), single-sided / two-positive lines, and any line targeting a control account. Entry numbers come from `SequenceService` as `JE-NNNNNN`. The balance/one-sided invariant is enforced in app code (not a SQL CHECK) for SQLite/Postgres parity.
- **Posting maps**
  - **Sale** (`INV-…`): Dr account (or `Cash on Hand` fallback) for `paidAmount`; Dr residual account for `dueAmount` (→ `Deferred Cash Receivables` when commitments exist, else `A/R`); Cr `Sales Revenue` for `netAmount`; Dr `COGS` / Cr `Inventory` for the snapshotted `costAtSaleTime` total.
  - **Purchase** (`BILL-…`): Dr `Inventory` for `netAmount`; Cr `Cash on Hand` for `paidAmount`; Cr `A/P` for `dueAmount`.
  - **Receipt** (`RCT-…`): Dr account (or `Cash on Hand` fallback) / Cr `A/R`.
  - **Payment** (`PMT-…`): Dr `A/P` / Cr account (or `Cash on Hand` fallback).
  - **Fund transfer** (`TRF-…`): Dr destination / Cr source — both user-owned accounts.
  - **Commitment settlement**: Dr account / Cr `Deferred Cash Receivables`.
- **Source-of-truth status** — the journals are a **parallel ledger** today: postings happen on every write, but the four operational financial statements still derive from operational tables. `GET /reports/trial-balance`, `/income-statement-from-journals`, and `/balance-sheet-from-journals` derive from `journal_lines` and provide the parity check. The read-side flip ships once a daily reconciliation proves journals match operational totals over a closing cycle.
- **Reversal** — `POST /sales/:id/reverse`, `/purchases/:id/reverse`, `/payments/:id/reverse`, `/fund-transfers/:id/reverse`. Each posts a balancing journal entry (signs flipped, linked by `reverses_journal_entry_id`, idempotent on that link), books an inverse stock movement where applicable (tagged `SALE_REVERSAL` / `PURCHASE_REVERSAL`), walks back serial allocation state, and marks the original row `reversedAt` / `reversedBy` / `reversalReason`. Original rows stay visible. Idempotent on `reversedAt`. Reason text required. (Sale reversal restores `costedQty` but not `avgCost`.)
- **Period locking** — `accounting_periods` with statuses `OPEN`, `SOFT_CLOSED` (posts allowed, UI warns), `HARD_CLOSED` (posts rejected). Endpoints `POST /periods`, `POST /periods/:id/{soft-close,hard-close,reopen}`, `GET /periods`. Overlapping ranges are rejected on create; a date with no covering period is implicitly OPEN (fresh installs aren't blocked). `JournalService.post()` calls `PeriodsService.assertOpen(entryDate)` so anything posting through it honours the lock automatically.
- **Read-only journal browser** — `GET /journals?from=…&to=…&limit=…` lists journal entries newest-first with their lines; `GET /journals/:id` returns one entry with full detail.

### 13. UX / UI
- **Branded** — "Hassan Electronics · Home Appliances". The HE monogram (gold "H" + blue "E", house roof + spark; source: `erp-frontend/logo.png`, an already-transparent PNG) is the application icon — browser favicon, Windows Start Menu / Taskbar / Explorer thumbnail, and electron-builder app/installer icon. [scripts/make-icons.ps1](scripts/make-icons.ps1) uses the PNG source as-is (no chroma-key — that step only applied to the legacy `logo.jpeg` black backdrop) and emits the PNG set (192 / 512 / 1024) + a multi-resolution Windows `.ico` (16–256) into `public/` and `erp-desktop/build-resources/icon.ico`. The logo is rendered **only** on the Sign in and Request access screens (transparent, no chip backdrop). The in-app chrome shows the wordmark, not the logo.
- **Light & Dark theme** — toggle in the topbar; preference persisted in `localStorage` under `hassan-theme`. Initial theme honours `prefers-color-scheme`. No flash on load (an external `theme-bootstrap.js` runs in `<head>` before React — extracted from inline so the strict `script-src 'self'` CSP holds). A theme toggle also sits in the top-right of the login card.
- **Flat Windows 10 design** — [tokens.css](apps/erp-frontend/src/styles/tokens.css) + [app.css](apps/erp-frontend/src/styles/app.css) hold the variables (with [App.css](apps/erp-frontend/src/App.css) carrying legacy + print/modal/login rules; tokens.css loads last and wins on shared names). Solid surfaces, sharp 90° corners (zero border-radius), 1px borders, no glass / blur / aurora / glow / animation. Lightweight `color` / `background` / `border` transitions only. `content-visibility: auto` on long tables. Built for low-end hardware.
- **Fonts** — Segoe UI Variable / Segoe UI system stack for text; Cascadia Code / Consolas for numbers, voucher refs, SKUs. (`public/index.html` still links Google Fonts as a leftover, but the CSS token stack is system-only.)
- **Coloured sidebar icons** — every nav item gets a tinted square chip in its own `--nav-c` token. The sidebar has **13 entries** (POS Terminal was removed when Sales Voucher became the default Sales tab; `/pos` is URL-reachable): Dashboard (blue), Cash Book (forest-green), Customer (teal), Sales (magenta), Supplier (burnt-orange), Purchase (lavender), Item (sky-blue), Stock (moss-green), Employee (indigo), Account (amber), Users (cyan), Reports (deep-purple), System (grey). Active item paints a 3px accent strip on the left edge.
- **Global search** — topbar search lazy-loads customers / suppliers / employees / accounts / items on first focus and routes hits to the matching ledger / catalogue page. Auto-generated codes (`CUST-`, `SUPP-`, `EMP-`, `ACC-`) make code-search reliable.
- **Sticky topbar** — 44 px tall, solid surface. Global search on the left; Sync button, login bell (superuser), user chip, theme toggle on the right. Hamburger appears ≤ 860 px to open the off-canvas sidebar.
- **Collapsible sidebar rail** — the brand chip at the top of the sidebar doubles as the rail toggle: click it to collapse the desktop sidebar to a 56 px icon-only rail; click again to expand. State persists in `localStorage` (`hassan-sidebar-rail`). On mobile (≤ 860 px) the off-canvas drawer pattern is used instead.
- **Hand-rolled SVG charts** — `MiniCharts` (StackedBar, Donut, Bullet, HorizontalBars, FunnelStages, MiniLine) — no charting library, flat Win10 aesthetic, fixed pixel heights to reserve layout.
- **Status chips** — semantic-color filled rectangles for payment states, low-stock badges, session status, sync-queue status, warranty status.
- **WhatsApp share** — a "Send on WhatsApp" button on the sales invoice, booking receipt, warranty lookup cards, and customer ledger (balance reminder). It opens a free `wa.me` deep link (WhatsApp Web/Desktop on a PC, the app on mobile) with the customer's number and a prefilled text message — no backend, no API token, no per-message cost. Phone numbers are normalised to international form for `wa.me` ([`utils/whatsapp.js`](apps/erp-frontend/src/utils/whatsapp.js)); a missing number opens the contact picker instead. The printed PDF (Print → Save as PDF in the browser dialog) is attached manually after the chat opens — `wa.me` can only carry text.
- **Unsaved-changes guard** — every CRUD form (items, categories, brands, customers, suppliers, stores, accounts, employees, users, vouchers, stock transfers, fund transfers, purchase orders, sale/purchase returns, damaged goods, stock adjustments, cash-register sessions, employee payments, incentive targets / awards / rules, POS new-customer modal, etc.) is tracked by a shared [`useUnsavedChangesPrompt` hook](apps/erp-frontend/src/hooks/useUnsavedChangesPrompt.js). The hook diffs the live form against its initial snapshot; when dirty it (a) attaches a capture-phase `click` listener that intercepts any `<a href="#/…">` before React Router sees it, pops a confirm dialog, and only lets the navigation through if the user agrees, and (b) wires `beforeunload` for tab close / refresh. The click-interceptor approach was chosen over React Router's `useBlocker` because the app uses the declarative `<HashRouter>` (not a data router), where `useBlocker` is unavailable.
- **Seamless title bar (Electron)** — the in-app `.topbar` and the sidebar header (`.brand`) share the exact same background as the Windows-drawn min/max/close overlay (`#fafafa` light, `#333333` dark, both pinned to `--surface-elev` in tokens.css). No 1 px border lines on the top 44 px band — the opaque overlay sits on top of the topbar, so any border would appear truncated at the seam. Separation from page content comes from the `--bg` vs `--surface-elev` colour contrast.
- **Accent colour — hardcoded Windows blue (`#0078d4`).** Every accent surface resolves through `var(--primary)` / `var(--info)`. Not user-configurable — keeping it fixed avoids an OS-accent bridge, a Settings page, a boot-time shade-derivation script, and cross-platform colour-format edge cases.

---

## CSV import & data migration

Every master-data list has an **Import CSV** button (next to the CSV / PDF export). Use it to bulk-load records exported from your previous software. The dialog also has a **Download blank template** button that writes a `.csv` with exactly the right header row plus one example line — edit that file and re-upload.

**How it works**
- The first CSV row is the **header**; column names must match the tables below (case-sensitive, exactly as written). Extra columns are ignored; missing optional columns fall back to the field default.
- Each data row becomes one record. The file is parsed in the browser and posted to `POST /api/<entity>/import`, which maps every row onto the same Create DTO the on-screen form uses and runs the **same validation**.
- **Per-row isolation** — a bad row never aborts the import. The result dialog shows how many rows imported and lists each failed row by its CSV line number (row 1 = header, so data starts at line 2) with the reason, so you can fix the spreadsheet and re-upload.
- **Booleans** accept `true`/`false`, `yes`/`no`, `1`/`0` (blank = the column default). **Numbers** may include thousands separators. **Dates** use `YYYY-MM-DD`.
- **Auto-generated codes** (`CUST-…`, `SUPP-…`, `ACC-…`, `EMP-…`) can be left blank — they're assigned on insert. Provide a `code` only to preserve your old identifiers.
- **Relations are referenced by name, not by ID.** Import in dependency order: **Brands** and **Categories** *before* Items; parent categories *above* their children in the Categories file; and **Items + Suppliers + Stores** *before* Purchase Bills.
- The import **creates** rows; it does not update or de-duplicate existing ones. Re-running a file inserts the rows again (a duplicate SKU/barcode/category-code is rejected per-row).

Legend: **R** = required · cells left blank use the default.

### `customers` → Import on Customer hub → Info (or Master Data → Customers)

| Column | R | Type / values | Notes |
|---|---|---|---|
| `code` | | text | Blank → auto `CUST-000001`. Set to keep your old code. |
| `name` | **R** | text | |
| `phone` | | text | |
| `email` | | email | Must be a valid email if present. |
| `address` | | text | |
| `openingBalance` | | number ≥ 0 | Positive = customer owes the shop. |
| `creditLimit` | | number ≥ 0 | Rupee ceiling for credit sales. |
| `creditEnabled` | | boolean | Master switch for credit; default `false`. |
| `isActive` | | boolean | Default `true`. |

### `suppliers` → Supplier hub → Info

| Column | R | Type / values | Notes |
|---|---|---|---|
| `code` | | text | Blank → auto `SUPP-000001`. |
| `name` | **R** | text | |
| `phone` | | text | |
| `email` | | email | Valid email if present. |
| `address` | | text | |
| `openingBalance` | | number ≥ 0 | Positive = shop owes the supplier. |
| `isActive` | | boolean | Default `true`. |

### `brands` → Item hub → (Brands panel) / Supplier hub → Brands

| Column | R | Type / values | Notes |
|---|---|---|---|
| `name` | **R** | text | |
| `description` | | text | |
| `isActive` | | boolean | Default `true`. |

### `categories` → Item hub → Categories

| Column | R | Type / values | Notes |
|---|---|---|---|
| `name` | **R** | text | |
| `code` | | text ≤ 8, `A–Z`/`0–9` | Uppercased; used in local serials `LOCAL-<code>-<year>-<seq>`. Must be unique. |
| `description` | | text | |
| `parent` | | category **name** | Parent category. **List the parent on an earlier line** than its children, or create it first. |
| `isActive` | | boolean | Default `true`. |

### `items` → Item hub → Catalogue

Import **Brands** and **Categories** first — items reference them by name.

| Column | R | Type / values | Notes |
|---|---|---|---|
| `modelNo` | * | text | Manufacturer model number; used as the display name. |
| `name` | * | text | Falls back to `modelNo`. **One of `modelNo`/`name` is required.** |
| `sku` | | text | Blank → auto-derived from `modelNo` (suffixed `-2`, `-3` on collision). Unique. |
| `barcode` | | text | Unique if present. |
| `brand` | | brand **name** | Must already exist. |
| `categories` | | category **names** | One or more, separated by `;` (e.g. `Refrigerators; Inverter`). Each must already exist. |
| `purchasePrice` | | number ≥ 0 | UI-default reference price. |
| `salePrice` | | number ≥ 0 | |
| `openingAvgCost` | | number ≥ 0 | Cost of stock carried in from previous software / an opening stocktake. **Use this, not `avgCost`** — cost is re-derived by replaying documents, and a value written straight into `avgCost` has no document behind it and is lost on the first recost. |
| `openingCostedQty` | | whole number ≥ 0 | Units carried in at `openingAvgCost`. Pair the two or neither. |
| `unit` | | text | Default `pcs`. |
| `minStockLevel` | | whole number ≥ 0 | Low-stock threshold. |
| `tracksSerials` | | boolean | Default `true`. Off for bulk accessories. |
| `serialRequiredOnSale` | | boolean | Default `true`. |
| `hasWarranty` | | boolean | Default `true`. |
| `warrantyType` | | `COMPANY` / `SHOP` / `CHECKING_ONLY` / `NONE` | Default `COMPANY`. |
| `warrantyDays` | | whole number | Warranty length in **days** (365 = 1 year). |
| `isInternalGenerated` | | boolean | Local auto-serial items (unbranded). Default `false`. |
| `isActive` | | boolean | Default `true`. |

### `stores` → Stock hub → Stores

| Column | R | Type / values | Notes |
|---|---|---|---|
| `name` | **R** | text | |
| `location` | | text | |
| `isActive` | | boolean | Default `true`. |

### `accounts` → Account hub → Info

Only the five **user-facing** account flavours can be imported. The seven system accounts and eight control nodes are seeded automatically on boot — don't put them in the CSV.

| Column | R | Type / values | Notes |
|---|---|---|---|
| `code` | | text | Blank → auto `ACC-000001`. |
| `name` | **R** | text | |
| `type` | **R** | `CASH` / `BANK` / `WALLET` / `CAPITAL` / `CREDIT` | Uppercased. |
| `bank` | | text | Bank name (for `BANK` accounts). |
| `accountNumber` | | text | |
| `openingBalance` | | number | |
| `isActive` | | boolean | Default `true`. |

### `employees` → Employee hub → Info

| Column | R | Type / values | Notes |
|---|---|---|---|
| `code` | | text | Blank → auto `EMP-000001`. |
| `name` | **R** | text | |
| `role` | | text | e.g. Cashier, Salesman. |
| `phone` | | text | |
| `email` | | text | |
| `address` | | text | |
| `monthlySalary` | | number ≥ 0 | |
| `openingBalance` | | number | Positive = shop owes the employee. |
| `joinedAt` | | date `YYYY-MM-DD` | |
| `salaryDay` | | whole number 1–31 | Day of month for auto-accrual; blank = no auto-accrual. |
| `firstSalaryInAdvance` | | boolean | Accrue the joining month too. Default `false`. |
| `notes` | | text | |
| `isActive` | | boolean | Default `true`. |

### `purchases` (opening stock via bills) → Purchase hub → Bills

This is **how you load opening stock.** Items on their own carry no quantity — stock only exists once a purchase bill books an IN movement (which also rolls up weighted-average cost and records the supplier payable). Rather than hand-entering a bill per item, import a bills CSV: **one row per line item**.

- Rows that share a non-blank `billNo` collapse into **one multi-line bill**. The bill's header fields (`supplier`, `store`, `discount`, `paidAmount`, `paymentMethod`, `notes`) are read from that bill's **first row**.
- A **blank `billNo`** makes the row its own single-line bill with an auto `BILL-…` number.
- Each bill is created exactly like a hand-entered one: stock IN + weighted-average cost roll-up + optional serial intake + a balanced journal entry. Failures are isolated **per bill**.
- Import **Items, Suppliers, and Stores first** — they're referenced by name.
- Imported bills are dated **now** (the bill has no historical-date field). That's fine for opening stock; the stock quantity and cost are what matter.
- To split a bill's goods across branches, put a different `store` on individual lines (the header `store` is the default). Move stock between stores afterwards via **Stock → Transfers**.

| Column | R | Type / values | Notes |
|---|---|---|---|
| `billNo` | | text | Groups rows into one bill. Blank → its own auto `BILL-…`. Must be unique across existing bills. |
| `supplier` | | supplier **name** (or code) | The distributor; blank = no supplier (cash purchase). |
| `item` | **R** | item **SKU / barcode / model no / name** | Must already exist. |
| `store` | | store **name** | Where this line's stock lands. Per line; falls back to the bill header's store. |
| `quantity` | **R** | whole number ≥ 1 | Units received. |
| `unitPrice` | **R** | number ≥ 0 | Purchase **cost** per unit (feeds weighted-average cost). |
| `serials` | | text | Optional manufacturer serials for serialised items, separated by `;` (or newlines). Can be left blank and captured later at POS. |
| `discount` | | number ≥ 0 | Bill-level discount (read from the bill's first row). |
| `paidAmount` | | number ≥ 0 | Amount paid at bill time; the remainder becomes a supplier payable. |
| `paymentMethod` | | text | `CASH` / `BANK` / … (label only; the journal credit defaults to Cash on Hand). |
| `notes` | | text | |

> The column lists above are the single source of truth, mirrored in code at [`erp-frontend/src/utils/importSchemas.js`](apps/erp-frontend/src/utils/importSchemas.js) (UI templates + hints) and the per-module `importRows()` mappers in `erp-backend/src/modules/<entity>/<entity>.service.ts` (purchase bills: [`purchases.service.ts`](apps/erp-backend/src/modules/purchases/purchases.service.ts)). Keep all three in lockstep when a column changes.

---

## Technical stack

| Layer | Tech |
|---|---|
| Backend | NestJS 11 (TypeScript, target ES2023), TypeORM 0.3.29, class-validator 0.15, `@nestjs/schedule` 6, helmet 8, axios 1.16 |
| Database | PostgreSQL via Supabase Session pooler **or** local SQLite (`better-sqlite3` 12.9) — same code, switched by env |
| Frontend | React 19 + HashRouter (`react-router-dom` 7) + axios + CRA build system |
| Theming | CSS custom properties driven by `data-theme="light"|"dark"` on `<html>` |
| Desktop | Electron 40 + electron-builder 25 (NSIS / DMG / AppImage targets) |
| Native | `better-sqlite3` rebuilt against Electron's Node ABI by `prebuild-install` / `@electron/rebuild` during packaging |
| Testing | Jest 30 + ts-jest with an in-memory SQLite TypeORM data source per spec |

---

## Architecture

```
                                                ┌─────────────────────────┐
  Shop PC (cashier laptop / desktop)            │  Supabase Postgres      │
  ┌────────────────────────────────────┐        │  (Session pooler)       │
  │ Electron wrapper                   │        └──────────▲──────────────┘
  │   ├─ NestJS backend (port 3001)    │                   │ sync/push
  │   │   ├─ TypeORM → SQLite          │                   │ (HMAC-signed,
  │   │   │   <userData>/erp.sqlite    │                   │  idempotent
  │   │   ├─ OutboxModule              │                   │  by event.id)
  │   │   ├─ SyncModule (manual flush)─┼───────────────────┘ ▲
  │   │   ├─ Journals/PeriodsModule    │      Sync button in │
  │   │   ├─ ReportsModule (read-only) │      topbar triggers│
  │   │   ├─ AuditSubscriber           │      POST /sync/flush
  │   │   └─ ErrorLogFilter            │
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
              │       SyncSignatureGuard (HMAC)│
              └────────────────────────────────┘
```

The backend codebase is the **same** in both places — it switches between SQLite and Postgres based on whether `DATABASE_URL` is set. The cloud-side backend additionally receives sync events (HMAC-authed, idempotent by event id); the local-side backend additionally pushes its outbox upstream on demand.

Key cross-module wiring: `OutboxService` is the only shared dependency between the sales / purchases / POS producers and the sync worker (so `SalesModule` never imports `SyncModule` — that would be circular). `SequenceModule`, `AccountsModule`, `JournalsModule`, `PeriodsModule`, `ItemSerialsModule`, and `UsersModule` are `@Global()` so their services inject anywhere without re-import.

---

## Repo layout

```
apps/erp-backend/
├─ src/
│  ├─ main.ts                 # NestJS bootstrap; helmet/CSP, scoped body limits, CORS allow-list,
│  │                          # global ValidationPipe + ErrorLogFilter, migrations-on-boot
│  ├─ app.module.ts           # TypeORM datasource + 36 feature modules; SQLite ↔ Postgres switch
│  ├─ app.controller.ts       # GET /api/health (@Public)
│  ├─ data-source.ts          # standalone DataSource for the TypeORM migration CLI
│  ├─ seed.ts                 # stress-test data seeder (npm run seed)
│  ├─ common/
│  │  ├─ entities/            # BaseEntity (abstract), Setting (key/value)
│  │  ├─ delete-guard.ts      # FK-violation → friendly 409
│  │  └─ sqlite-checkpoint.service.ts  # WAL checkpoint on shutdown
│  ├─ testing/test-db.ts      # in-memory TypeORM helper for spec files
│  └─ modules/                # 36 domains:
│     accounts/ attendance/ audit-logs/ backup/ brands/ cash-register/
│     categories/ customers/ damaged-goods/ deliveries/ employee-incentives/
│     employee-transactions/ employees/ error-logs/ fund-transfers/ incentives/
│     item-serials/ items/ journals/ outbox/ payments/ periods/ pos/
│     purchase-orders/ purchases/ reports/ returns/ sales/ sequences/
│     service-tickets/ stock/ stock-transfers/ stores/ suppliers/ sync/ users/

apps/erp-frontend/
├─ logo.jpeg                  # source brand mark (HE monogram on black)
├─ public/
│  ├─ index.html              # CSP meta + theme bootstrap before React renders
│  ├─ theme-bootstrap.js      # applies saved/preferred theme pre-render (CSP-safe, external)
│  ├─ manifest.json           # PWA name + icon set
│  ├─ favicon.ico             # generated by scripts/make-icons.ps1
│  └─ logo192/512/1024.png    # generated; transparent
├─ src/
│  ├─ api/client.js           # axios instance, baseURL resolver, tiny GET cache + write-invalidation
│  ├─ auth/{AuthContext,RequireSuperuser}.js
│  ├─ components/             # Layout, Brand, Icon, Logo, ThemeToggle, HubFrame, SyncButton,
│  │                          # GlobalSearch, CrudPage, ReverseAction, ExportButtons, MiniCharts,
│  │                          # LedgerView, VoucherPage, AgingPanel, master/{Items,Categories}Panel
│  ├─ hooks/                  # useResource, useUnsavedChangesPrompt
│  ├─ nav/hubs.js             # single source of truth for sidebar + hubs
│  ├─ pages/                  # Dashboard, POS, SalesVoucher, Financials, print pages, …
│  ├─ theme/ThemeContext.js
│  ├─ utils/exporters.js      # CSV (BOM) + print-to-PDF
│  └─ styles/                 # tokens.css, app.css (flat Windows 10)

apps/erp-desktop/
├─ src/main.js                # Electron main: app:// protocol, splash, spawn backend, title-bar theme
├─ src/preload.js             # tiny window.erpBridge (setTitleBarTheme) over IPC
├─ build-resources/
│  ├─ icon.ico                # multi-resolution Windows icon
│  ├─ installer.nsh           # NSIS install/uninstall narrative
│  └─ config.example.json     # template for <userData>/config.json
└─ scripts/
   ├─ prepare-resources.js    # build backend + frontend + stage production-only backend tree
   ├─ rebuild-native.js       # better-sqlite3 Electron-ABI rebuild (prebuild-install → rebuild)
   └─ postinstall.js          # lenient native rebuild (dev convenience)

apps/erp-mobile/                # standalone read-only Android app (Expo / React Native)
├─ App.js                     # bottom-tab navigation (Dashboard / History / Stock / Returns / Reports / Balances)
├─ src/
│  ├─ config.js               # Supabase URL + anon key
│  ├─ supabase.js             # supabase-js client (read-only, no auth session)
│  ├─ api.js                  # all read queries (views + FK-embedded table reads)
│  ├─ screens/                # Dashboard, History, Stock, Returns, Reports, Balances
│  └─ components/ui.js        # flat-Win10 cards, KPI tiles, badges, search
├─ supabase/setup.sql         # anon grants + computed views (on-hand, A/R, A/P, KPIs, product sales)
└─ android/                   # generated by `expo prebuild` (gitignored)

packages/                    # reserved for shared code across apps (empty placeholder)
scripts/
└─ make-icons.ps1             # chroma-key logo.jpeg → favicon + Windows .ico (run from repo root)
docs/                        # CODEBASE_MAP.md, design.md, handoff.md, Manual.txt (gitignored)
local/                       # GITIGNORED: secrets, mobile-signing keystore, live db, backups, repo bundles
package.json                 # monorepo root — orchestration scripts (npm run dev:backend / build:web / …)
```

---

## Setup & run

> The four apps under `apps/` (`erp-backend`, `erp-frontend`, `erp-desktop`, `erp-mobile`) are built and run **independently** — each has its own `package.json` + `node_modules`. The root `package.json` is a **monorepo orchestrator**: convenience scripts (`npm run dev:backend`, `build:web`, `test:backend`, `package:desktop`, `install:all`, …) that delegate into each app via `npm --prefix apps/<app> …`. It deliberately does **not** enable npm-workspaces hoisting — that would break the desktop packaging (`prepare-resources.js` runs `npm ci` against each app's own lockfile) and the Electron/React-Native native builds.

### Prerequisites
- **Node.js 24+** (Node 22 also fine if you avoid newer syntax in `prepare-resources.js`)
- (Optional, for Electron packaging) **Visual Studio Build Tools 2022** with "Desktop development with C++". Not needed if you stay on the pinned Electron 40 (uses prebuilt better-sqlite3 binaries).

### Two-terminal dev
```bash
cd apps/erp-backend
npm install
npm run start:dev          # http://localhost:3001/api · health: http://localhost:3001/api/health

# in a second terminal
cd apps/erp-frontend
npm install
npm start                  # http://localhost:3000
```

On first boot the backend seeds a SUPERUSER (`admin` / `Tech@123`), the chart of accounts (7 system + 8 control), and (on SQLite) the schema via `synchronize: true`. Change the admin password from `Users → Change Password`.

### Seed stress-test data
```bash
cd apps/erp-backend
npm run seed                 # heavy (default): ~400 items, ~5k sales, plus every other module
SEED_SCALE=medium npm run seed
SEED_SCALE=light  npm run seed
```
`src/seed.ts` boots the Nest application context (no HTTP server, so the global `AuthGuard` is bypassed) and drives the **real domain services** — so every generated row is internally consistent: stock movements, double-entry journals, serial bindings, weighted-average cost roll-ups and sequence numbers all come out as they would in production. It always writes to the local **SQLite** file the dev server uses (it blanks `DATABASE_URL` before the app module loads, so it never touches Supabase). It covers master data, items (serialised + model-only), purchases, sales (plain, bill-book voucher with split receipts, and POS), payments, returns, service tickets, deliveries, fund/stock transfers, damaged goods, purchase orders, attendance, employee transactions, incentives, and cash-register sessions. Each write is retried on transient SQLite transaction races and tallied (it prints a per-phase summary plus the on-disk counts it persisted). Runs are additive and safe to repeat.

Two caveats specific to seeding bulk volume into SQLite:
- **Stop the dev server first** — SQLite is single-writer; a second process holding the file silently drops the seed's transactional commits.
- The seeder **detaches the `AuditSubscriber`** for the run. That subscriber fires `audit.record(...)` fire-and-forget on every write; under the seed's tight loop those un-awaited INSERTs interleave with a `dataSource.transaction()` on the shared better-sqlite3 connection and poison it (a second `BEGIN` → `no such savepoint`), rolling the transaction back on close. Detaching it keeps every transaction clean — the trade-off is that seeded rows carry no audit-log entries (the live app keeps its subscriber untouched).

### Production builds
```bash
cd apps/erp-backend && npm run build      # → apps/erp-backend/dist
cd apps/erp-frontend && npm run build     # → apps/erp-frontend/build (SPA bundle for app://localhost, or any static host)
```

---

## Environment variables

`apps/erp-backend/.env` (gitignored). Either set `DATABASE_URL` for Postgres / Supabase or leave it blank for SQLite.

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
# refuses to start at all without them and rejects every request without a valid signature.
SHOP_ID=hassan-main      # short identifier; cloud rejects pushes whose X-Shop-Id doesn't match
SHOP_SYNC_SECRET=        # 32+ random bytes (hex). Generate with:
                         # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Migrations on boot. When `true`, the backend applies any pending TypeORM
# migrations before opening port 3001. The Electron main process sets this
# automatically for packaged installs; dev (`npm run start:dev`) leaves it
# unset and relies on `DB_SYNC=true` / SQLite synchronize.
DB_MIGRATE_ON_BOOT=false
```

**Supabase gotchas** — use the **Session pooler** (`pooler.supabase.com:5432`), NOT the Direct connection (free-tier blocks IPv4) and NOT the Transaction pooler on `:6543` (breaks TypeORM prepared statements). The pooler username is `postgres.<project-ref>`, not plain `postgres` — `app.module.ts` parses `DATABASE_URL` by hand and passes explicit `username`/`password`/`host`/`port` rather than the `url:` option, because some pg/TLS paths split the dotted username and ship only `postgres` (which the pooler rejects). URL-encode special characters in the password (`@` → `%40`).

> ⚠️ **Production warning — `DB_SYNC=true` is dev-only.** On Postgres / Supabase this lets TypeORM silently `ALTER` / `DROP` columns whenever an entity diff changes — irrecoverable data loss is one rogue refactor away. The migration CLI exists ([data-source.ts](apps/erp-backend/src/data-source.ts) + `db:migrate*` scripts); to baseline production: `cd apps/erp-backend && npm run db:migrate:generate -- src/migrations/InitialSchema`, commit it, flip `DB_SYNC=false`, set `DB_MIGRATE_ON_BOOT=true`, and ship every later schema change as a migration. Until that baseline is generated, treat `DB_SYNC=true` against a populated Supabase DB as the one-time first-run.

---

## Mobile / LAN access

The CRA dev server binds to `0.0.0.0`. From a phone on the same network, visit `http://<your-LAN-IP>:3000` — the API client at [src/api/client.js](apps/erp-frontend/src/api/client.js) resolves the API base URL from `window.location.hostname`, so the page auto-targets `http://<LAN-IP>:3001` instead of the phone's own localhost. The backend CORS allow-list ([main.ts](apps/erp-backend/src/main.ts)) permits private-network IPv4 origins (10/8, 172.16/12, 192.168/16) plus the exact `app://localhost` / localhost dev origins.

To find your LAN IP on Windows: `ipconfig` → look for an IPv4 address starting with `192.168.…` or `10.0.…`.

The Electron build doesn't need LAN — the renderer loads from the custom `app://localhost` scheme and the API client targets `http://localhost:3001`.

---

## Desktop installer (Electron)

The Electron wrapper produces a fully self-contained NSIS installer. The shop PC needs no prior Node install — the bundle ships:

- The Electron shell (asar; native `*.node` binaries unpacked).
- `resources/backend/{dist,node_modules,package.json}` — the NestJS API the shell launches at startup, staged from a **production-only** dependency tree (no Jest/Webpack/TS/ESLint). Native `better-sqlite3` rebuilt against Electron's Node ABI.
- `resources/frontend/build/` — the React build the shell serves via a custom `app://localhost` protocol (registered in [erp-desktop/src/main.js](erp-desktop/src/main.js) with `protocol.handle('app', …)` and an SPA fallback to `index.html`). The renderer is **not** loaded with `file://` — under `file://` Chromium reports `window.location.origin === "null"`, which makes React Router 7 throw "Failed to construct 'URL': Invalid URL" inside `new URL(path, origin)`. `app://localhost` gives the renderer a real origin and the crash disappears.

The main process holds a **single-instance lock** (a second launch focuses the existing window instead of racing to bind `:3001`), shows a frameless **splash** while the backend starts, reads `<userData>/config.json` on every launch, and spawns the backend as a child process (`ELECTRON_RUN_AS_NODE=1`, mirroring stdout/stderr to `<userData>/backend.log`).

### Renderer sandboxing

The Electron `BrowserWindow` runs with `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`. The renderer has no direct access to Node APIs, the filesystem, or `require`. The preload script ([erp-desktop/src/preload.js](erp-desktop/src/preload.js)) exposes a deliberately tiny `window.erpBridge` IPC surface — just `setTitleBarTheme(theme)` so the Windows-drawn min/max/close overlay can flip light↔dark with the in-app theme. A hypothetical XSS inside the React build cannot read `<userData>/erp.sqlite` or shell out — it sees the same DOM a regular browser tab would. The strict Helmet CSP on the backend and the `<meta http-equiv="Content-Security-Policy">` tag in [index.html](apps/erp-frontend/public/index.html) (`script-src 'self'`) further block dynamic script evaluation.

### Window chrome (VS Code-style)

The window drops the native menu bar (`Menu.setApplicationMenu(null)`) and hides the native title bar (`titleBarStyle: 'hidden'`). Windows still draws minimize / maximize / close in the top-right via `titleBarOverlay` (44 px tall, theme-aware). The in-app `.topbar` becomes the drag region (`-webkit-app-region: drag`), with `no-drag` opt-outs on every interactive child. The preload's `setTitleBarTheme(theme)` flips the overlay colours with the app theme. (Note: there is no OS-accent-colour push — the accent is the fixed Windows blue.)

### Build the installer

```bash
cd apps/erp-desktop
npm install
npm run package:win        # → release/Hassan Electronics-Setup-1.0.0.exe     (NSIS installer, ~115 MB)
                           # → release/Hassan Electronics-Portable-1.0.0.exe  (single-file portable, ~115 MB)
```

`package:win` chains `npm run prepackage` (build backend + frontend, stage a production-only backend tree, rebuild native deps for Electron) and `electron-builder --win --x64`. On macOS / Linux:

```bash
npm run package:mac        # .dmg (universal arm64 + x64)
npm run package:linux      # AppImage (x64)
npm run package            # current platform
```

**App identity.** `build.productName` is **"Hassan Electronics"** — used for the installer filename, shortcut, Start Menu entry, Add/Remove Programs label, BrowserWindow title, and `.exe` basename. `appId` is `com.hassanelectronics.erp`.

**NSIS installer:** per-user (no admin needed), `oneClick: false` (Welcome → License → Install Location → Install), `allowToChangeInstallationDirectory: true`, `deleteAppDataOnUninstall: false` (the SQLite database and backups under `%APPDATA%\Hassan Electronics` survive an uninstall). Creates Desktop + Start Menu shortcuts named "Hassan Electronics". A custom NSIS include ([installer.nsh](erp-desktop/build-resources/installer.nsh)) keeps the details panel open and prints a per-step install/uninstall narrative (the uninstall narrative notes that SQLite + backups are intentionally preserved).

**Portable .exe:** electron-builder's `target: portable` produces a single self-extracting `.exe` — no install, no admin, no Start Menu shortcut. SQLite + backups still land in `%APPDATA%\Hassan Electronics`, so data persists across portable launches and survives a switch between the portable and the installed build on the same machine.

**Backend launch resilience.** First boot of a fresh SQLite install runs TypeORM `synchronize: true` across all entities and seeds the chart of accounts — slow on low-end hardware. The desktop wrapper polls the backend's `/api/health` for up to **5 minutes** (request timeout 1 s, retry every 500 ms), short-circuits the wait the instant the backend process dies (so you see a real error instead of staring at a timer), and mirrors backend stdout + stderr to `%APPDATA%\Hassan Electronics\backend.log`. Any "Backend did not become ready" / "Backend stopped" dialog points at the log path.

**Unsigned.** Windows SmartScreen warns on first run; click *More info → Run anyway*. To suppress, ship a code-signing certificate via electron-builder's `signtoolOptions`.

> **Electron version pin.** `apps/erp-desktop/package.json` pins `electron` to `^40.0.0`. better-sqlite3 v12.10 only publishes Electron prebuilts through ABI `electron-v145` (= Electron 40); newer majors force a source compile via node-gyp which fails without MSVC Build Tools. If you bump Electron, either wait for a matching better-sqlite3 release or install "Build Tools for Visual Studio 2022" with the **Desktop development with C++** workload.

### Wire the install to Supabase

After install (per user), drop a `config.json` at:

- **Windows:** `%APPDATA%\Hassan Electronics\config.json`
- **macOS:** `~/Library/Application Support/Hassan Electronics/config.json`
- **Linux:** `~/.config/Hassan Electronics/config.json`

(The folder name follows `build.productName`. Older installs may still write to `…\erp-desktop\` — copy `config.json` over after the first launch of the renamed build.)

```json
{
  "cloudSyncUrl": "https://your-cloud-host.example.com/api/sync/push",
  "databaseUrl": ""
}
```

- `cloudSyncUrl` set → local node pushes outbox events to your deployed cloud receiver **when the user clicks Sync**. The local SQLite remains authoritative; the cloud is eventually-consistent. (You also need `SHOP_ID` + `SHOP_SYNC_SECRET` configured on both ends.)
- `databaseUrl` set → backend skips SQLite and runs **directly** against Supabase (for branches with reliable internet that want to bypass offline mode).
- Both unset → app runs purely offline against local SQLite.

The Electron main process reads `config.json` on every launch and injects the values as env vars into the spawned backend (`CLOUD_SYNC_URL`, `DATABASE_URL`, plus `DB_SSL`/`DB_SYNC` defaults when a database URL is present). No re-install needed when the cloud URL changes.

---

## Mobile app (read-only Android)

`erp-mobile/` is a **standalone** Android app (Expo SDK 57 / React Native) that gives the owner a phone view of the shop. It is strictly **read-only** — it never writes data — and it talks **directly to Supabase** via the public **anon key** (PostgREST / `supabase-js`), *not* through the NestJS backend. It shows the same numbers the desktop reports do:

- **Dashboard** — today & month sales, all-time revenue / gross profit, A/R, A/P, inventory value at cost, low-stock count.
- **History** — sales and purchases (toggle), searchable by invoice/bill no, tap a row to expand line items.
- **Stock** — per-item on-hand / available / reserved / value, low-stock filter, search by name / SKU / barcode / model.
- **Returns** — sale returns and purchase returns (toggle), searchable by return no, tap a row to expand line items + reason. Each card badges where the goods went (Restocked vs To company on a warranty claim; To supplier vs Warranty credit) and, on sale returns, whether the customer got cash back or store credit — plus an Exchange badge when the return is the give-back leg of an exchange.
- **Reports** — top products by revenue or profit (toggle), ranked, with per-item units sold, brand, and margin %, over a revenue/profit totals header.
- **Balances** — customer A/R and supplier A/P (toggle) with outstanding totals.

Because the phone reads the cloud copy, it shows whatever the shop has **pushed via Sync**:

```
Local shop node (SQLite)  ──Sync push──▶  Supabase Postgres  ◀──anon read──  Mobile APK
```

### One-time Supabase setup

On-hand stock, party balances and per-product profit are **not stored** — they're computed. Run [`erp-mobile/supabase/setup.sql`](apps/erp-mobile/supabase/setup.sql) in the Supabase SQL editor (as the project owner). It grants the `anon` role SELECT on the business tables the app reads and creates five views whose math mirrors `ReportsService` exactly: `mobile_item_stock` (on-hand = running `SUM(IN − OUT)` of `stock_movements`, **not** `costed_qty`), `mobile_customer_balance`, `mobile_supplier_balance`, `mobile_product_sales` (units / revenue / COGS / profit per item, COGS from the snapshotted `cost_at_sale_time`), and `mobile_kpis`. It deliberately does **not** expose users/auth, settings, audit/error logs, or the sync queue. (Confidentiality is out of scope; the app is read-only.)

The script is idempotent, so **re-run it whenever a new app version reads a table or view it didn't before** — otherwise the new screen comes back with a permission error on the phone rather than at build time. It also assumes the cloud schema already has the columns the app selects, so let the cloud receiver boot with `DB_SYNC=true` after a schema change before installing a release that depends on it.

### Configure & build

1. Paste the Supabase **anon / public** key into [`erp-mobile/src/config.js`](apps/erp-mobile/src/config.js) (the URL is already set from `.env`). Never put the `service_role` key in the app.
2. Bump `versionCode` + `versionName` in **both** [`app.json`](apps/erp-mobile/app.json) and `android/app/build.gradle` — they are separate files and Gradle reads only the latter, so a bump in one place alone ships a release the phone can't tell apart from the last one.
3. Build the signed APK:

```
cd apps/erp-mobile
npm install
npx expo prebuild --platform android     # generates android/ (one-time)
cd android
./gradlew assembleRelease                 # → app/build/outputs/apk/release/app-release.apk
```

Requires the Android SDK + a JDK 17–21. The release build is signed with `android/app/hassan-release.keystore` (credentials in `android/gradle.properties`, `HASSAN_*`). **Back up that keystore + passwords** — future updates must use the same key, and `android/` is gitignored (regenerated by `expo prebuild`, which overwrites the signing edits — re-apply them if you re-prebuild).

---

## Backups

The backup is a full JSON snapshot of every business table (sales, purchases, payments, items, stock movements, cash sessions, fund transfers, journals, incentives, outbox / sync queue, …) plus M2M join tables. User/auth tables (`users`, `user_access_requests`, `user_login_events`) and the `backups` table itself are intentionally excluded so a snapshot never leaks credentials, never injects a superuser, and never recurses.

- **Scheduled** — an hourly `@Cron` snapshots if today's scheduled hour has passed and no backup exists for today (default 20:00, configurable).
- **Manual snapshot** — `System → Backups → Save backup now` writes a snapshot to disk on the server.
- **Download snapshot** — streams an in-memory snapshot to the browser as a file download (no file persisted server-side; superuser-only). A backup is a frozen-in-time copy of the whole business, so downloads are restricted and recorded.
- **Restore** — `Restore from file` (superuser + one-shot reauth + literal `RESTORE` confirmation) accepts a JSON snapshot up to 100 MB, takes a pre-restore safety snapshot, then wipes and replays every business table inside a single transaction.
- **Storage** — defaults to `apps/erp-backend/backups/` in dev; Electron forces `<userData>/backups` so backups survive uninstalls. Each row carries a `sha256` for verification.

---

## Testing

Backend has **157 Jest tests across 14 spec files**, covering the high-value services:

```bash
cd apps/erp-backend && npm test            # full suite, ~14 s
cd apps/erp-backend && npx jest --coverage # coverage report (~32 s)
```

Tests use an isolated in-memory SQLite TypeORM data source per spec ([src/testing/test-db.ts](apps/erp-backend/src/testing/test-db.ts)) — no Supabase calls, no shared state. (The ERROR/WARN lines printed during the run — `SyncService … failed: boom`, `SyncSignatureGuard … rejected`, etc. — are intentional negative-path assertions inside passing tests, not failures.)

Spec files: `app.controller`, `categories.service`, `items.service`, `journals/journal.service`, `periods/periods.service`, `pos.service`, `purchases.service`, `reports.service`, `sales.service`, `sequences/sequence.service`, `stock.service`, `sync/hmac.util`, `sync/sync-signature.guard`, `sync/sync.service`.

Per-service line coverage (real numbers): **stock 100 %**, **sequence 100 %**, **sync-signature.guard 100 %**, **periods 97.7 %**, **hmac.util 96.4 %**, **journal 92.2 %**, **pos 83.8 %**, **categories 83.7 %**, **purchases 74 %**, **items 71.4 %**, **sales 69.8 %**, **reports 54.5 %**, **outbox 47.4 %**, **sync 44.9 %** (push worker not exercised). Project-wide line coverage is ~29 % — most thin CRUD and operational modules are intentionally untested.

**Untested (intentional):** `accounts`, `attendance`, `brands`, `customers`, `suppliers`, `stores`, `payments`, `returns`, `deliveries`, `service-tickets`, `item-serials`, `cash-register`, `fund-transfers`, `incentives`, `employee-incentives`, `purchase-orders`, `stock-transfers`, `damaged-goods`, `employees`, `users` — thin CRUD wrappers or operational modules in the same shape as the covered services.

---

## Project conventions

- **Module-per-domain** — every backend domain owns its entities / DTOs / service / controller under `src/modules/`. New domain → new folder. New variant of an existing domain → new tab in the parent hub, not a new sidebar entry.
- **TypeORM columns** — snake_case in DB via `name: 'foo_bar'`, camelCase in entity. `.orderBy()` must use the camelCase property name (`.orderBy('m.createdAt')`, not `'m.created_at'`).
- **Dialect-portable date columns** — use `@Column({ type: Date, ... })` (the `Date` constructor), NOT `@Column({ type: 'timestamp' })` or `@Column({ type: 'datetime' })`. `Date` resolves to `datetime` on SQLite and `timestamp without time zone` on Postgres. `'timestamp'` is Postgres-only and crashes better-sqlite3 with `DataTypeNotSupportedError`; `'datetime'` is the reverse trap. (`type: 'date'` for date-only string columns is fine on both.)
- **Indexes** — 110+ `@Index` decorators across the 48 entities target the columns each service actually filters or sorts on. Composite indexes for filter + sort or filter + filter patterns. Same decorators auto-create in both SQLite and Postgres via `synchronize: true` on next boot.
- **DTO validation** — every Create / Update DTO uses class-validator decorators. The global `ValidationPipe` has `whitelist`, `transform`, and `forbidNonWhitelisted` on — extra fields throw.
- **Auto-generated voucher numbers** — `INV-`, `BILL-`, `SR-`, `PR-`, `RCT-`, `PMT-`, `TRF-`, `PO-`, `DMG-`, `STK-TRF-`, `JE-`, `SVC-`, `DLV-`, and master-data codes `CUST-`, `SUPP-`, `EMP-`, `ACC-`, plus per-type employee-transaction prefixes (`SALA-`, `SAL-`, `ADV-`, `RBT-`, `EXP-`, `INC-`, `ADJ-`). Every prefix routes through `SequenceService.next(prefix, seedFromMax?)`, which atomically increments a row in the `sequences` table (`prefix` PK, `nextValue` int, 6-digit zero-pad). On Postgres the read is `SELECT … FOR UPDATE`; on SQLite the single-writer connection serialises. Seeded on first call from a count callback. Numbers may have gaps from rolled-back transactions, but two distinct calls never collide.
- **Quick-search bar everywhere** — `CrudPage` exposes `searchKeys={[...]}` so each list page controls which fields it searches over.
- **Delete = safe** — master-data deletes are wrapped in `deleteOrConflict` ([delete-guard.ts](apps/erp-backend/src/common/delete-guard.ts)) which catches DB foreign-key violations (Postgres `23503` / SQLite `FOREIGN KEY constraint failed`) and turns them into a friendly 409 telling the user to use Close instead. (Categories rely on `onDelete: 'SET NULL'` for their self-ref children and aren't guarded; brands / stores / suppliers / customers / employees / accounts / items are.)
- **Reports are read-only** — no writes allowed inside `ReportsService` or its controller.
- **Outbox decouples sales from sync** — `OutboxService` is the only thing both sales / purchases / POS and the sync worker depend on. Do not make `SalesModule` import `SyncModule` (circular).
- **HashRouter, not BrowserRouter** — required so the SPA fallback inside the `app://` protocol handler works on any sub-route.
- **Renderer loads through `app://localhost`, never `file://`** — `file://` makes `window.location.origin === "null"` in Chromium, which crashes React Router 7's internal `new URL()` calls.
- **Sync runs only on the user's command** — the topbar "Sync" button calls `POST /api/sync/flush`. There is no background cron; don't add one back without product agreement.
- **No native menu bar** — `Menu.setApplicationMenu(null)` in the Electron main is deliberate. Surface new app-level actions inside the React topbar / sidebar.
- **Auth** — opaque server tokens (not JWT), 12-hour sliding window. `AuthGuard` is global; mark public endpoints with `@Public()`.
- **No DB triggers** — cross-cutting concerns use a TypeORM `EntitySubscriber` (already done for audit logs).
- **COGS basis** — always `SaleItem.costAtSaleTime` (a snapshot of `Item.avgCost` at sale time). `Item.purchasePrice` is a UI-default reference only — never a COGS basis.
- **Profit accounting** — `netIncome` is the trading result; `adjustedNetIncome = netIncome + incentive awards in period`. The Statement of Changes in Equity reconciles against `adjustedNetIncome`.

See [CLAUDE.md](./CLAUDE.md) for the AI-assistant guide with the same conventions and the explicit "don'ts".

---

## Roadmap — shipped & out of scope

A directional roadmap, agreed for a single-shop install operated by the owner and one accountant. Items below are **scoped** to a 1-2 person shop — the enterprise patterns common in multi-cashier chains (granular role matrices, MFA, maker-checker chains) are deliberately out of scope; see the bottom of this section.

**Status legend:** ✅ shipped · 🔜 next up

### Security & data protection

- ✅ **HMAC-signed sync** — `SyncSignatureGuard` validates `X-Shop-Id` / `X-Sync-Timestamp` / `X-Sync-Signature` on every `POST /api/sync/push`. Rejects on missing headers, shop-id mismatch, > 5-minute timestamp skew, or signature mismatch (constant-time). Local node refuses to push if `SHOP_ID` / `SHOP_SYNC_SECRET` are unset; the receiver refuses to start without them. Dedicated specs cover sign/verify and every guard rejection case.
- ✅ **Body limit scoped** — `main.ts` sets the global Express body limit to `256kb`; `POST /api/backup/restore` gets a route-prefix `json({ limit: '100mb' })` registered first (body-parser's `req._body` guard makes the global parser a no-op for that path).
- ✅ **Helmet + CSP + CORS allow-list** — Helmet ships a strict CSP for API responses (`default-src 'self'`, `script-src 'self'`, …) plus the standard hardening headers; CORS is restricted to `app://localhost`, the localhost dev ports, and private-network IPv4 LAN origins. The renderer's script-governing CSP is a `<meta>` tag in `index.html` (the theme bootstrap was extracted to an external file so `script-src 'self'` holds).
- ✅ **Electron sandbox** — `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`; the renderer can't `require`, touch the filesystem, or shell out. Preload exposes only `window.erpBridge.setTitleBarTheme`.
- ✅ **Sequence-table voucher numbers** — `sequences` table + global `SequenceService` replaces every `count + 1` generation. Postgres uses `SELECT … FOR UPDATE`; SQLite relies on single-writer.
- ✅ **Backup-restore hardening (integrity)** — `@SuperuserOnly()` on `/backup/restore`, `/backup/download-now`, `/backup/:id/download`. Restore additionally requires a one-shot `X-Reauth-Token` (from `POST /auth/reauthenticate`, 60-second TTL) or the legacy password — protects against a left-open session wiping the DB. Download endpoints are superuser-gated but un-reauthed (read-only; confidentiality isn't the threat model).
- ✅ **TypeORM migrations infra** — standalone [data-source.ts](apps/erp-backend/src/data-source.ts) + `db:migrate*` scripts; the main process applies pending migrations on launch when `DB_MIGRATE_ON_BOOT=true` (Electron sets it). Baseline + flip to `DB_SYNC=false` before treating Supabase as production.
- ✅ **WAL checkpoint on shutdown** — `SqliteCheckpointService` runs `PRAGMA wal_checkpoint(TRUNCATE)` on graceful shutdown (self-disables on Postgres) so the next boot doesn't replay a large WAL after a crash.
- ❌ **At-rest encryption (SQLite + backups) — explicitly out of scope.** Confidentiality is the lowest of the C-I-A trio for this deployment; encryption would *hurt* availability (lose the key → brick every backup) without addressing any real threat. Plaintext on purpose.

### Accounting integrity

- ✅ **True double-entry journals (parallel ledger)** — `journal_entries` + `journal_lines`. Every business write routes through `JournalService.post()` in the source row's transaction; unbalanced or control-account posts are rejected. Source-of-truth flip to journal-derived statements lands after a closing-cycle reconciliation. Dedicated specs cover balance invariants, period gating, and reversal posting.
- ✅ **Full chart-of-accounts hierarchy** — `accounts` carries `accountCategory`, `accountSubType`, `parentAccountId`, `isControl`. Seeded on boot: 8 control nodes + 7 leaf system accounts (incl. `1145 Deferred Cash Receivables`). Posts to control accounts are rejected; system/control accounts can't be deleted.
- ✅ **Accounting period locking** — `accounting_periods` with `OPEN → SOFT_CLOSED → HARD_CLOSED` (+ reopen). `JournalService.post()` calls `assertOpen(date)` — SOFT_CLOSED passes (UI warns), HARD_CLOSED rejects. A date with no covering period is OPEN. Dedicated specs.
- ✅ **Reversal workflow (no hard delete on financial data)** — `POST /{sales,purchases,payments,fund-transfers}/:id/reverse`. Posts a balancing journal entry linked by `reverses_journal_entry_id`, books inverse stock movements where applicable, walks back serial state, and stamps `reversedAt`/`reversedBy`/`reversalReason`. Idempotent; reason required. Dedicated reversal specs.

### Appliance-specific features (shipped)

- ✅ **Hybrid serialised + bulk inventory** — `item_serials` with two independent flags `tracksSerials` + `serialRequiredOnSale`, supporting serialised+required (appliances), serialised+optional (gray-market), and bulk (accessories) modes. Serial uniqueness is global. Purchase intake accepts a per-line serial textarea; whatever isn't captured at purchase can be captured at sale.
- ✅ **Warranty management** — per-item `hasWarranty` + `warrantyType ∈ { COMPANY, SHOP, CHECKING_ONLY, NONE }` + `warrantyDays`. The receipt prints a per-line warranty block; warranty fields **freeze on the serial row at sale time** so a later Item edit doesn't rewrite past promises. Public `GET /api/item-serials/warranty/:serial` returns non-PII data for a counter terminal; a Customer-hub `/warranty-lookup` tab wraps it.
- ✅ **Model-only warranty (no serial)** — the warranty window is also frozen onto the **sale line** (`sale_items`) for every entry path, so it survives even when no serial exists. `/warranty-lookup` adds Receipt-no / Customer / Model+date resolve modes via `GET /api/sales/warranty/{by-invoice,by-customer,by-model}`.
- ✅ **Booking-Hold state machine** — `ItemSerial.allocationStatus ∈ { AVAILABLE, BOOKED, DELIVERED }` orthogonal to physical `status`; partial-pay sales hold units BOOKED; Strict-Handover guard blocks DELIVERED while `dueAmount > 0`. See §4.
- ✅ **Overdue Bookings dashboard** + **Booking Hold receipt** (`/print/booking-receipt/:id`) + **Box Hold Tag** (`/print/box-tag/:id`) + **local serial labels** (`/print/serial-label/:serial`).
- ✅ **Delivery / dispatch tracking** (six-status) + **service / repair tickets** (seven-status), both with status tallies and funnel charts.

### Sales / inventory / reporting (next up)

- 🔜 **Quotation → Sales Order → Invoice flow** (`QUO-…` / `SO-…`, no journal/stock impact until converted).
- 🔜 **Discount engine** — line + invoice discounts, `discount_schemes`, SUPERUSER-reauth over a threshold (the only same-person maker-checker kept).
- 🔜 **Multi-UOM** (`units_of_measure` + per-item conversions).
- 🔜 **Reorder-point suggestions** with one-click PO drafts per preferred supplier.
- 🔜 **Physical stock take** (`stock_takes` + lines → reason-driven adjustments).
- 🔜 **Barcode label printing** (real Code-128, A4 label sheets).
- 🔜 **Z-report / X-report** end-of-session PDFs and **comparative Income Statement** columns.
- ✅ already shipped here: **A/R + A/P aging**, **item profitability**, **slow-moving stock**, **margin analytics**, **trial balance**, **journal-driven Income Statement + Balance Sheet (parallel)**, **customer credit limit** (`creditEnabled` + `creditLimit`, enforced in `SalesService.create`).

### Tax & Pakistan compliance (planned)

- 🔜 **GST / sales-tax engine** (settings-level NTN/STRN, per-item GST rate + tax category, `Cr GST Payable` / `Dr GST Input` journal lines).
- 🔜 **FBR-compliant tax invoice format** + placeholder for FBR invoice number / QR.
- 🔜 **FBR POS real-time integration** behind `FBR_POS_INTEGRATION=true`, with a retry outbox so the till never stops selling.
- 🔜 **Withholding tax on supplier payments** + monthly WHT report.

### Explicitly out of scope (1-2 user shop)

Considered and dropped — the workload doesn't justify the friction for an install run by one or two trusted people on a single shop PC:

- **Granular RBAC with named roles + permission matrix** — the `SUPERUSER` / `USER` split is enough.
- **TOTP MFA mandatory on SUPERUSER** — login friction on a machine the owner controls physically.
- **Maker-checker / multi-level approval chains** — there's no second human reviewer.
- **Brute-force lockout + failure-counter table** — the backend listens on localhost (and optional LAN); not internet-exposed.
- **httpOnly-cookie sessions + CSRF double-submit** — `Authorization: Bearer …` from localStorage is sufficient given the threat model (no XSS surface in self-authored React with no user-generated HTML).
- **At-rest encryption of SQLite / backups** — see Security section; integrity + availability come first.
- **Code-signed installer** — nice-to-have; the SmartScreen warning is the cost for now.

If the shop scales past two users or the install starts running on internet-exposed hardware, revisit this list — none of the dropped items are unreachable, just unjustified today.
