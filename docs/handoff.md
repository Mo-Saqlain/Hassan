# Handoff — 2026-05-31 (rolling up everything since 2026-05-13)

Two and a half weeks of sessions have shipped seven commits on `main` since the last handoff. This document rolls the work into one read so a new developer can pick the codebase up without reading the full conversation log.

## Where we are now

- **Backend**: 144 Jest tests passing. TypeScript compiles clean against the live entities. Dev backend boots in ~3-6 s on local SQLite.
- **Frontend**: CRA build clean in CI mode (warnings-as-errors). ~167 KB main JS gzipped.
- **Schema**: managed by TypeORM `synchronize: true` on SQLite (always) and Postgres (gated by `DB_SYNC=true`). 50 public-schema tables on Supabase last we wiped + recreated.
- **Local dev right now** runs against local SQLite because the Supabase project (`vgjecwkyselvwwvmawvn`) is paused or deleted — the pooler returns `ENOTFOUND tenant/user … not found`. The `DATABASE_URL` line is commented out in `erp-backend/.env`; restore it once the Supabase project is back.

The Electron installer is **not** rebuilt for this wave. Recipe in [README.md → Desktop installer](README.md#desktop-installer-electron) when you want to cut one.

## Big-ticket changes since 2026-05-13

The story arc reads in the git log; here's the narrative.

### Phase A — Operational hardening (commits `7063a38`, `1cea44a`, earlier)
- **Unsaved-changes guard** across every CRUD form ([useUnsavedChangesPrompt](erp-frontend/src/hooks/useUnsavedChangesPrompt.js)). Intercepts hub-tab navigation + window unload.
- **Backup download auth fix**: `/backup/download-now` + `/backup/:id/download` now route through axios with the bearer token instead of `window.location.href` (which can't carry headers and was 401-ing).
- **Reverse UI**: `<ReverseAction>` button on Sales, Purchases, Receipts, Payments, Fund Transfers — backend already had `POST /:id/reverse` for all five; this just exposes it. Replaces the old hard-delete on Fund Transfers (which destroyed audit trails).
- **Dropped the entire Accent settings feature**: hardcoded Windows blue (`#0078d4`) directly in `tokens.css`. Removed ~280 LOC across `pages/Accent.js`, `theme/accent.js`, the OS-accent IPC in Electron, the boot-time bootstrap script, and the System-hub tab. Memory: `feedback_confidentiality_out_of_scope` and `feedback_win10_flat_ui` informed the simplification.

### Phase B — Inventory + hybrid serial model (`ec5c32a`)
- **Hybrid serialised + bulk inventory**: `Item` gets `tracksSerials`, `serialRequiredOnSale`, `hasWarranty`, `warrantyType ∈ { COMPANY, SHOP, CHECKING_ONLY, NONE }`, `warrantyDays`. Bulk accessories (cables, stands, remotes) bypass the serial UI entirely. Gray-market goods can be `tracksSerials=true` + `serialRequiredOnSale=false`.
- **ItemSerial entity**: one row per physical appliance. Fields: `serial` (unique), `itemId`, `status` ∈ { IN_STOCK | SOLD | RETURNED | DAMAGED | WRITE_OFF }, plus purchase + sold metadata + warranty fields.
- **Promise-to-pay date on sales** (later refactored into `paymentCommitments` in §C).
- **Boot timeout 90 s → 300 s** in the Electron launcher. First-launch Defender scan + 41-entity TypeORM schema sync was timing out on cold installs.

### Phase C — Architectural foundations (`9372906`)
The big one. Three contracted items + operational features in one wave.

1. **Weighted-average inventory costing.** Replaces the wrong "use the most recent `Item.purchasePrice` as COGS" pattern. `Item.avgCost` + `Item.costedQty` roll on every purchase via the textbook formula. `SaleItem.costAtSaleTime` snapshots at sale time so **historical margins never shift retroactively**. `Item.purchasePrice` is now a UI-only "last vendor price" reference — every COGS read uses `costAtSaleTime`.
2. **`paymentCommitments` JSON column on Sale** + new `Deferred Cash Receivables (1145)` system account. Residual on a sale with commitments lands there (not generic A/R). `POST /sales/:id/settle-commitment` settles one + posts the second journal half. Dashboard widget reads `GET /sales/deferred/upcoming`.
3. **Sync poison-pill isolation.** `SyncService.pushPending()` wraps each event's status update in its own try/catch, flips bad rows to `SYNC_FAILED` with the server error, and keeps draining. Drops the 50-event chunk cap. New `GET /sync/failed` + `POST /sync/failed/:id/retry` endpoints; topbar tooltip reads `"Sync now — N pending, M skipped due to errors"` when failures exist.

Plus: reserved inventory (`Item.reservedQty` driven by Deliveries), delivery + service-ticket modules, cash-denomination counter on the close-register modal, slow-moving stock + margin-analytics reports, SHA-256 backup verification, POS keyboard shortcuts (F2/F4/F8/F9).

### Phase D — Booking-Hold state machine + dashboard + local serials (`bf16745`)
The roadmap's Phases 1-4 (and bits of 5) in one wave.

- **Days-elapsed visibility on aging.** `ReportsService.arAging/apAging` now return `maxDaysElapsed`, `oldestUnpaidDate`, AR-only `daysSinceFirstPastPromise`. New per-invoice detail endpoints `GET /reports/ar-aging/:customerId` and `/reports/ap-aging/:supplierId`. Dashboard surfaces "Oldest unpaid: 47d (Ali Khan)". Customer + Supplier ledgers gained an [AgingPanel](erp-frontend/src/components/AgingPanel.js).
- **Incentive-driven effective cost.** `IncentiveTarget.triggerThresholdPct` (default 80). Once net-sold qty crosses that %, the per-unit credit (`incentiveAmount / targetQuantity`) is treated as a likely earnback. `GET /incentives/cost-adjustments` returns the per-item map. POS shows the credit on the cart row and softens the "below cost" warning when the effective cost still clears.
- **Booking-Hold state machine.** `ItemSerial.allocationStatus ∈ { AVAILABLE, BOOKED, DELIVERED }` orthogonal to the existing physical `status`. `ItemSerialsService.reserveForBooking / releaseBooking / markDelivered`. POS branches on `dueAmount > 0`: partial-pay → BOOKED, full-pay → DELIVERED. Settling the last commitment auto-flips BOOKED → DELIVERED. **Strict Delivery Handover Authorisation**: `DeliveriesService.update()` rejects DELIVERED when the linked sale has `dueAmount > 0`. WarrantyLookup got an amber "On hold · payment pending" chip.
- **Overdue Bookings dashboard** (`/overdue-bookings`, Sales-hub tab). `GET /sales/overdue-bookings?minDays=7` + `POST /sales/:id/release-booking` (reuses the reversal pipeline, idempotent). Advance stays as customer credit — no auto-refund.
- **Local serial auto-generation.** `Category.code` (uppercase A-Z 0-9, ≤ 8 chars), `Item.isInternalGenerated`, `ItemSerial.isInternalGenerated`. `POST /item-serials/generate-local` mints `LOCAL-<CategoryCode>-<Year>-<4-digit-seq>` using the same `sequences` table as INV-/PMT-/BILL- counters. POS cart line gets a `+ Generate & Print Local IDs` button.

### Phase E — Booking-Hold prints + route-order fix (this commit)
- **`/print/serial-label/:serial`** — 2"×1" thermal-sticker template ([SerialLabelPrint.js](erp-frontend/src/pages/SerialLabelPrint.js)). Barcode-style bars + serial + item name. Works on any printer; thermal label rolls just scale the `@page`.
- **`/print/booking-receipt/:id`** — customer-facing booking receipt ([BookingReceiptPrint.js](erp-frontend/src/pages/BookingReceiptPrint.js)). Heavy red "BALANCE PENDING" banner, per-line table with serials, payment schedule, customer + cashier signature lines.
- **`/print/box-tag/:id`** — 4"×6" landscape sheet for the physical box ([BoxTagPrint.js](erp-frontend/src/pages/BoxTagPrint.js)). Giant rotated "DO NOT SELL" watermark, oversized customer name, serials, balance due.
- **`InvoicePrint.js` conditional booking banner** — when `dueAmount > 0` the normal sale receipt also carries the red "BALANCE PENDING" header so a mid-balance reprint still surfaces the hold status.
- **POS success banner + Sales History + OverdueBookings row actions** all carry `"Print booking hold slip"` + `"Print box tag"` links/buttons for any partial-pay invoice.
- **Bug caught + fixed live:** Nest matches routes in declaration order. `/api/sales/overdue-bookings` was being shadowed by `@Get(':id')` (with `ParseUUIDPipe`) declared earlier in the controller — moved all static routes above param ones in [sales.controller.ts](erp-backend/src/modules/sales/sales.controller.ts). Documented the rule in a comment block above the routes.

## Architecture state in one diagram

```
                                ┌──────────────────────────┐
                                │      POS Terminal        │
                                │  serial scan / textarea  │
                                │  F2 F4 F8 F9 shortcuts   │
                                │  incentive credit chip   │
                                │  + Generate Local IDs    │
                                └────────────┬─────────────┘
                                             │ checkout
                                  dueAmount > 0?
                                  ┌───────────┴───────────┐
                                 yes                       no
                                  │                        │
                ┌─────────────────▼──────────┐   ┌─────────▼──────────┐
                │ reserveForBooking          │   │ bindToSale         │
                │   serial → BOOKED          │   │  serial → DELIVERED│
                │   Sale.dueAmount > 0       │   │  Sale fully paid   │
                │   Journal:                 │   │  Journal:          │
                │     Dr Cash (paid)         │   │    Dr Cash         │
                │     Dr DEFERRED_RECEIVABLE │   │    Cr Revenue      │
                │     Cr Revenue             │   │    Dr COGS         │
                │     Dr COGS · Cr Inventory │   │    Cr Inventory    │
                └──────────────┬─────────────┘   └────────────────────┘
                               │
                               │  customer comes back, pays balance
                               │  POST /sales/:id/settle-commitment
                               ▼
            ┌────────────────────────────────────────────┐
            │  Receipt voucher (RCT-…) created           │
            │  Journal: Dr Cash · Cr DEFERRED_RECEIVABLE │
            │  If dueAmount now zero: BOOKED → DELIVERED │
            │  on every linked serial                    │
            └────────────────────────────────────────────┘

            ┌────────────────────────────────────────────┐
            │  Customer never comes back (>= 7 days)     │
            │  Overdue Bookings page · Release to Floor  │
            │  → reverse() pipeline · BOOKED → AVAILABLE │
            │  Advance stays as customer credit          │
            └────────────────────────────────────────────┘

            ┌────────────────────────────────────────────┐
            │  DeliveriesService.update() to DELIVERED   │
            │  THROWS if Sale.dueAmount > 0              │
            │  ⇒ strict handover authorisation           │
            └────────────────────────────────────────────┘
```

## How to verify locally

```powershell
# 1) Backend on local SQLite (Supabase is paused)
cd erp-backend
npm run start:dev
# Health: http://localhost:3001/api/health → 200 OK
# Login:  admin / Tech@123 → token issued

# 2) Frontend
cd ../erp-frontend
$env:BROWSER='none'
npm start
# Open http://localhost:3000

# 3) Tests
cd ../erp-backend
npx jest --silent
# 144 tests, ~8 s. All green.

# 4) Frontend CI build
cd ../erp-frontend
$env:CI='true'
npm run build
# Compiles clean, ~167 KB main gzipped.
```

## End-to-end smoke flow

1. Sign in `admin / Tech@123`.
2. **Item → Catalogue → + Add Item**. Create three items to cover the three serial modes:
   - "Dawlance LVS-15" — defaults (tracksSerials, serialRequired, COMPANY warranty, 365 days).
   - "Local Speaker 12-inch" — model no. blank, brand blank, untick tracksSerials + hasWarranty.
   - "Gray-market AC" — tracksSerials on, serialRequiredOnSale off, warrantyType CHECKING_ONLY.
3. **Item → Categories → + Add Category** with `Code = COOLER` (test local serial generation).
4. **Purchase → Bills → + New Purchase.** Buy 3 of each. Paste serials into the Dawlance line (optional). Save → check Stock → Summary shows On Hand = 3 for each.
5. **POS Terminal.** Ring up one Dawlance:
   - Pay full → success banner shows "Print receipt" only. WarrantyLookup shows "Active warranty" green.
   - Pay partial (Rs 40k of Rs 100k) → success banner adds "Print booking hold slip" + "Print box tag". Sales History shows the row with overdue chip and Hold Slip / Box Tag buttons. WarrantyLookup shows "On hold · payment pending" amber.
6. **Sales → Overdue Bookings.** Set "Show bookings older than" to 0 days — the partial-pay sale appears. Click Release → confirm modal warns about the advance.
7. **Customer → Ledger** for that customer → AgingPanel above shows the residual with daysElapsed.
8. **Dashboard** Receivables card shows "Oldest unpaid: 0d ({customer})". Deferred Collections widget shows the commitment chip.
9. **Item → Catalogue.** Edit "Local Speaker 12-inch" → turn on tracksSerials + Auto-generate local serials. Save. **POS** → add it to cart → "+ Generate & Print Local IDs" button appears.

## Open items / follow-ups

- **Supabase project restoration.** Decide: restore the paused project (1-click in dashboard) or provision a fresh one and update `DATABASE_URL`. Until then, local dev runs against SQLite.
- **Installer not rebuilt.** When you cut the next installer: `cd erp-desktop; npm run package:win`. Pre-existing data in `%APPDATA%\Hassan Electronics\erp.sqlite` survives uninstall.
- **Allocation-state on existing rows.** `ItemSerialsService.onModuleInit` backfills `allocationStatus` on legacy rows (SOLD → DELIVERED, everything else → AVAILABLE). Idempotent. The wipe + re-init that happens on a fresh DB is the easy case; the backfill matters only on databases that had ItemSerial rows before this schema change shipped.
- **Booking auto-expiration**: deliberately not implemented. Manual Release-to-Floor from the dashboard is the only path — matches the "no surprise cron behaviour" preference recorded in memory and in CLAUDE.md "Don'ts".
- **Sync events for booking lifecycle**: not emitted separately. The cloud derives allocation state from the same SALE_CREATED + serial rows. Add dedicated events only if multi-location reporting becomes real.
- **Plain `purchasePrice` field on Item** is kept as a UI-only "last vendor price" reference. Reading it for COGS reintroduces the historical-margin-shift bug — there's a Don't entry in CLAUDE.md.
- **`Item.serialNumber` FK on SaleItem**: low priority (the synthesizer flagged it). Current soft-link via `saleInvoiceNo` works; revisit only if a real concurrency bug surfaces.

## Files of interest for the next developer

| Concern | File |
|---|---|
| Booking-hold state machine | [item-serials.service.ts](erp-backend/src/modules/item-serials/item-serials.service.ts) |
| POS booking branch | [pos.service.ts](erp-backend/src/modules/pos/pos.service.ts) `checkout()` |
| Strict handover guard | [deliveries.service.ts](erp-backend/src/modules/deliveries/deliveries.service.ts) `update()` |
| Sale settlement → delivered flip | [sales.service.ts](erp-backend/src/modules/sales/sales.service.ts) `settleCommitment()` |
| Overdue bookings + release | [sales.service.ts](erp-backend/src/modules/sales/sales.service.ts) `overdueBookings()` / `releaseBooking()` |
| Local serial mint | [item-serials.service.ts](erp-backend/src/modules/item-serials/item-serials.service.ts) `generateLocalSerials()` |
| Incentive cost adjustments | [incentives.service.ts](erp-backend/src/modules/incentives/incentives.service.ts) `effectiveCostAdjustments()` |
| Aging + days-elapsed | [reports.service.ts](erp-backend/src/modules/reports/reports.service.ts) `arAging()` / `apAging()` / `arAgingDetail()` |
| Booking receipt print | [BookingReceiptPrint.js](erp-frontend/src/pages/BookingReceiptPrint.js) |
| Box hold tag print | [BoxTagPrint.js](erp-frontend/src/pages/BoxTagPrint.js) |
| Serial label print | [SerialLabelPrint.js](erp-frontend/src/pages/SerialLabelPrint.js) |
| Overdue Bookings page | [OverdueBookings.js](erp-frontend/src/pages/OverdueBookings.js) |
| Shared aging table | [AgingPanel.js](erp-frontend/src/components/AgingPanel.js) |
| Shared reverse action | [ReverseAction.js](erp-frontend/src/components/ReverseAction.js) |
| Route-order rule (comment block) | [sales.controller.ts](erp-backend/src/modules/sales/sales.controller.ts) |

## Documentation map

- [README.md](README.md) — feature overview + architecture + setup.
- [design.md](design.md) — per-page UI reference (every page's text, controls, columns, and chips).
- [CLAUDE.md](CLAUDE.md) — conventions + don'ts + domain model essentials. Read this before extending.
- [Manual.txt](Manual.txt) — operator-facing reference (shop owner + accountant).
- This document — engineering changelog + verification recipe.

If you read only one before extending the code, read [CLAUDE.md](CLAUDE.md). The "Don'ts" list captures every architectural decision someone might be tempted to undo without context.
