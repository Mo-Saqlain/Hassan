# Hassan Electronics ERP — Design Reference

This file documents every page of the Hassan Electronics ERP/POS frontend: its purpose, what the user does on it, what data it shows, the components / classes it uses, and the routes / endpoints behind it. Pair it with [README.md](./README.md) (functional + technical overview) and the visual handoff in [`design_handoff_hassan_erp_redesign/`](./design_handoff_hassan_erp_redesign/).

---

## Design language

A modern fintech aesthetic — Linear / Mercury style — applied to a retail-shop ERP. The hallmarks:

- **Aurora glass** — a fixed, blurred radial-gradient backdrop in violet / cyan / pink / indigo (`body::before` in [tokens.css](erp-frontend/src/styles/tokens.css)) sits behind translucent cards (`backdrop-filter: blur(22px) saturate(170%)`). Visible in both light + dark themes.
- **Brand gradient** — `linear-gradient(135deg, #7c3aed → #6366f1 → #06b6d4)`. Used on the logo mark, primary buttons, charts, the "final" statement row in financials, and progress bars.
- **Coloured nav icon chips** — every sidebar entry has its own `--nav-c` token; the icon sits in a 26×26 rounded chip tinted with that colour at 18% alpha + 22% border. Active item gets a 3px gradient bar to the left + 30% chip fill.
- **Glossy specular highlight** — every `.card`, `.tile`, and `.stat` has a `::before` overlay with a soft white→transparent gradient at the top, so surfaces appear lit from above. Stronger in light mode (0.85 alpha) than dark (0.10 alpha).
- **Mono numerals** — `JetBrains Mono` with `tnum, zero` features for SKUs, prices, voucher refs, and table number columns. Body text stays in Inter.
- **Status chips** — pill-shaped, 24px tall, semibold 11.5px. Six variants (`chip-success`, `chip-warn`, `chip-danger`, `chip-info`, `chip-violet`, neutral) all derived from semantic tokens at 12–18% alpha background.

### Tokens you'll see referenced

| Token | What |
|---|---|
| `--gradient-primary` | Violet → indigo → cyan (CTAs, charts, brand mark) |
| `--gradient-accent` | Pink → violet → cyan (incentive highlights, accent CTAs) |
| `--surface` | Glass card background (alpha derived from `--glass-strength`) |
| `--surface-elev` | Topbar, sidebar, modal — more opaque than `--surface` |
| `--bg-aurora-1..4` | Four radial-gradient stops painted behind everything |
| `--nav-dashboard / -pos / -master / -tx / -cash / -stock / -ledger / -reports / -system` | Per-item sidebar colour |
| `--radius` (14px) / `--radius-lg` (18px) / `--radius-xl` (24px) | Corner radii |
| `--shadow` / `--shadow-lg` / `--shadow-glow` | Three shadow depths + a brand-coloured glow |

---

## Application shell

`<Layout>` is a CSS grid: **sidebar (256px) + main (1fr)** on desktop; collapses to a single column with an off-canvas drawer ≤ 860px.

```
┌────────────────┬─────────────────────────────────────────────┐
│                │  ▣ Hassan Electronics › current page  ⌘K 🌙│ ← topbar (60px sticky)
│   sidebar      ├─────────────────────────────────────────────┤
│   (264px)      │                                             │
│                │  Page content                               │
│                │                                             │
└────────────────┴─────────────────────────────────────────────┘
```

### Sidebar
- **Brand block** — 38×38 violet→cyan gradient chip with the Hassan "H + lightning" mark, "Hassan" wordmark, and `Home Appliances · ERP` sub-line.
- **Nav sections** — first section unlabelled (Dashboard, POS Terminal, Catalogue, Transactions, Cash Book), then `Inventory`, `Ledgers`, `Reports`, `System`.
- **Active state** — `.nav-item.active` lifts the row's background to `--surface-elev`, paints a 3px gradient bar on the left (in the item's `--nav-c`), and intensifies the icon chip to 30% alpha.
- **Footer** — small avatar chip with the owner's initials + role line.

### Topbar
- Breadcrumb: `Hassan Electronics › <current page>` (the current page is bold).
- Global search input (`Cmd+K` hint badge).
- Theme toggle (sun/moon).
- Hamburger button visible only ≤ 860px to open the sidebar drawer.

### Mobile (≤ 860px)
- Sidebar becomes a fixed off-canvas drawer (`transform: translateX(-100%)` → `translateX(0)` when `[data-nav="open"]` on `.app`).
- Tap-scrim closes the drawer.
- Topbar gets a hamburger; search expands to fill width; `⌘K` hint hides.
- Tables get horizontal scroll; grids collapse to one column; POS stacks vertically; cart rows reflow into 3-col with hidden price column.

---

## Pages

### 1. Dashboard — `/`

**Purpose:** At-a-glance view of today's trading and what needs attention.

**Layout (top to bottom):**

1. **Page header** — `Today at the shop` + day + session-open subtitle. **Export** button on the right (no "+ New sale" — POS is in the sidebar).
2. **4-up stat row** — `.grid-stat`:
   - Today's sales (Rs total · % vs yesterday)
   - Cash in till (Rs · entries today)
   - Items low on stock (count · critical count)
   - Adjusted Net Income MTD (Rs · `+ Rs X incentives` delta)
   Each `.stat` card has a colored `.stat-orb` (60% alpha radial blob, 40px blurred) at the top-right, a `.stat-label`, `.stat-value` (28px display font with smaller `.unit` prefix), and `.stat-foot` showing `▲/▼ delta` + `vs yesterday`.
3. **2-col grid:**
   - **Revenue chart** card — `Revenue, last 14 days · Net of returns & discounts`. SVG line chart with violet→cyan→pink gradient stroke and violet→transparent fill, dotted grid background. 14d / 30d / 90d ghost-button toggles.
   - **Latest activity** feed — rows of `(36px icon chip · party + ref-method · amount · status chip)`. Icon picks: sale=card, purchase=package, receipt=receipt, transfer=transfer.
4. **3-col grid:**
   - **Top selling — this month** — list of items with horizontal progress bars (violet→cyan gradient fill) and units-sold count.
   - **Receivables · Payables** — two rows: `Owed to you` (green) ↑ and `You owe` (rose) ↓.
   - **Incentive · this period** — gradient-tinted card (`linear-gradient(160deg, rgba(124,58,237,0.20), rgba(6,182,212,0.10))`) showing the active incentive target's progress bar + "View progress" button.

**Data sources:** `/reports/income-statement` (MTD), `/reports/cash-flow`, `/stock/summary`, `/sales` (latest 6), `/incentives/targets/progress`, `/reports/customer-balances`, `/reports/supplier-balances`.

---

### 2. POS Terminal — `/pos`

**Purpose:** Ring up a sale.

**Layout:** `.pos-grid` = 2 columns, `1fr 380px`, full viewport height minus topbar.

**Left column** (search + cart):
- Sticky toolbar: **scan input** (`Type model no. — e.g. DAWLANCE LVS-15` — 46px tall, mono font, bolt icon prefix) + customer button (default "Walk-in customer", `+` button to add a new customer in-flow).
- Scrollable cart: `.pos-cart-row` grid = `1fr 64px 80px 88px 28px` (item · qty stepper · unit price · line total · remove). Item cell shows model in bold + `category · brand` muted sub-line. Mono prices, bold totals. Last row removes its border.
- Footer: clear-cart ghost button + line/unit count.

**Right column** (`.card`, sticky payment panel):
- `Payment` heading + 4-cell `.pay-method-grid` of Cash / Card / Bank / Credit. Selected method gets the brand gradient + glow.
- Amount stack: `.amt-line` rows for Subtotal · Discount · Tax · **Net total** (bordered + bold).
- Amount paid input (mono, right-aligned).
- Change-due `.amt-line` (green text).
- Bottom: **Charge Rs X** primary CTA (54px tall, sparkles icon, gradient bg, shine sweep on hover) + Park sale ghost button.

**Data sources:** `/pos/sessions/active`, `/pos/lookup`, `/pos/sessions/:id/cart`, `/pos/sessions/:id/checkout`.

---

### 3. Catalogue (formerly "Master Data") — `/master`

**Purpose:** Hub for items, categories, brands, customers, suppliers, stores, accounts.

**Layout:**
- Page header: `Catalogue` + sub-line.
- `.grid-4` of seven `.tile` cards (Items / Categories / Brands / Customers / Suppliers / Stores / Accounts). Each tile = 44×44 coloured `.tile-icon` chip + `h3` title + 1-line description + `.tile-foot` (count + arrow).
- Tile colors:
  - Items — violet `#a78bfa`
  - Categories — light violet `#c084fc`
  - Brands — pink `#f472b6`
  - Customers — green `#34d399`
  - Suppliers — amber `#fbbf24`
  - Stores — orange `#fb923c`
  - Accounts — cyan `#22d3ee`
- Below the hub: **Recently edited** section — table of last-touched items with model no., brand, category, price (mono), on-hand (mono), Low/OK status chip.

Each tile clicks into its dedicated CRUD panel:
- **Items** — table sorted by model no. SKU is auto-derived from model no. and hidden behind an "Advanced" toggle. **No barcode UI** (model no. is the identifier).
- **Categories** — self-referencing tree with indented rows + parent picker.
- **Brands / Stores** — simple name + description CRUD.
- **Customers / Suppliers** — name + contact + opening balance + live computed balance, with "Open ledger" link.
- **Accounts** — five types (Cash / Bank / Wallet / Capital / Credit), opening balance, live balance via account ledger.

Every list has a **Quick search** filter, **CSV / PDF** export buttons, and a **Close / Reopen** toggle (soft-delete) instead of destructive deletes for rows with history.

---

### 4. Transactions hub — `/transactions`

**Purpose:** Grouped index of all transaction types.

**Layout:**
Four groups, each preceded by a coloured pill-bar + section heading:
- **Sales** (pink) — Sales History, Sale Returns
- **Purchases** (violet) — Purchases, Purchase Returns
- **Money** (cyan) — Receipts, Payments
- **Treasury** (teal) — Fund Transfers

Each group renders a `.grid-4` of tiles (same `.tile` spec as Catalogue but coloured per group).

---

### 5. Sales History — `/sales`

**Purpose:** Read-only chronological list of POS invoices.

**Layout:**
- Page header: `Sales history · 2,184 total · 14 today` + Filter / CSV / PDF buttons.
- `.ledger-toolbar` row: search input, method `<select>`, status `<select>`, day-summary chip (e.g. `14 today · Rs 482,300`).
- `.table-wrap` with columns: Date · Invoice · Customer · Method · Amount (mono) · Status · Reprint button.
- Status chips: `chip-success` (Paid) · `chip-warn` (Partial) · `chip-info` (Received) · `chip-violet` (Transferred).

**Data source:** `/sales`.

---

### 6. Sale Returns — `/sale-returns`, Purchases — `/purchases`, Purchase Returns — `/purchase-returns`

Same table-driven layout, columns customized per transaction type.

---

### 7. Receipts — `/receipts`, Payments — `/payments`

Voucher pages — receipt or payment voucher list with create form. Share `<VoucherPage direction="IN|OUT">`. Receipt prefix `RCT-`, payment prefix `PMT-`.

---

### 8. Fund Transfers — `/fund-transfers`

Treasury list. Transfer between any two of your own accounts (Capital ↔ Cash ↔ Bank ↔ Wallet ↔ Credit). Auto-numbered `TRF-NNNNNN`. New-transfer form + history table.

---

### 9. Cash Book — `/cash-register`

**Purpose:** Daily cash-register session and till activity.

**Layout:**
- Page header: `Cash book — <date>` + sub-line.
- `.session-bar` — gradient-tinted banner (violet→cyan at 18%/12% alpha) with a pulsing green dot, session label `Session #CR-NNNNN · OPEN | CLOSED`, opened-time, cashier, expected vs actual opening, and a status chip. The card is the day's reconciliation summary at a glance.
- 4-up `.grid-stat` of `Opening cash` / `Cash in` / `Cash out` / `Expected close`, each with a colored orb.
- Activity table: time · type chip (`SALE`, `PURCHASE`, `OPENING`, `TRANSFER`, `EXPENSE`, `PAYMENT`) · description · ref (mono) · in (green) · out (rose) · running balance (mono bold).

**Open-session flow**: if today's session isn't open, the page shows an **▶ Open Today's Register** CTA. The modal asks for actual cash counted, shows expected (from prior-day closing), and optionally books a `FundTransfer` (Capital → Cash) inline if there's a shortfall. Atomic — both rows persist or neither does.

**Close-session flow**: at end of day, `■ Close Register` captures actual closing count and stores the closing difference.

**Reminder:** if today's scheduled hour passes without a session being opened/closed, a red banner appears across every page.

**Data sources:** `/cash-register/day`, `/cash-register/sessions/status`, `/cash-register/sessions/open`, `/cash-register/sessions/:date/close`.

---

### 10. Stock Summary — `/stock`

**Purpose:** Per-item on-hand snapshot.

**Layout:**
- Page header: filter + **Adjust stock** primary CTA.
- 4-up stat row: Total SKUs · Below minimum (rose) · Healthy · Inventory value at cost (Rs).
- Table: Model no. · Brand · Category · On hand (mono bold) · Min (mono muted) · Status chip (`Low` rose / `OK` green).

**Adjust stock modal:** reason-driven (Loss / Damaged / Stock count — was over / Found / Stock count — was under / Correction +/−). Direction (IN/OUT) auto-derives from the reason so the cashier can't accidentally write off a loss as a stock add. Shows current on-hand and projected on-hand; blocks submit if it would go negative.

---

### 11. Stock Ledger — `/stock-ledger`

Filterable list of every `stock_movements` row. Filters: item, category, brand, supplier, from, to. Columns: Date · Item · SKU · Store · Type chip (IN green / OUT rose) · Qty · Reference · Running. CSV / PDF export.

---

### 12. Customer Ledger — `/customer-ledger/:id`, Supplier Ledger — `/supplier-ledger/:id`, Account Ledger — `/account-ledger/:id`

**Purpose:** Per-party / per-account chronological activity with running balance.

**Layout:**
- Page header: party/account name + sub-line + CSV / PDF buttons.
- `.ledger-toolbar`: party picker + From / To date inputs.
- `.panel-stripe` (2-col on desktop, stacks on mobile): Opening balance | Current balance. The current balance value is rendered with a violet→cyan gradient text fill (`-webkit-background-clip: text`) for emphasis.
- `.table-wrap` with columns: Date (mono) · Ref (mono bold) · Description · Debit · Credit (green) · Balance (mono bold).
- Closing balance footer row (sticky-style).

**Account Ledger** has a grouped dropdown (Cash / Bank / Wallet / Capital / Credit) and surfaces every payment voucher + fund transfer touching that account, plus cash-tagged sales/purchases for CASH accounts.

---

### 13. Financial Statements — `/financials`

**Purpose:** The four standard statements.

**Layout:**
- Page header: title + period range + Export.
- Date-range inputs.
- `.tabs` container with 4 tabs: **Income Statement · Balance Sheet · Cash Flow · Equity Changes**. Active tab gets `--surface-solid` background + shadow.

**Each statement** is rendered as a stack of `.stmt-row` blocks inside a `.card.stmt`:
- `.stmt-row.group` — section header (bold, top-bordered).
- `.stmt-row.sub` — indented line item.
- `.stmt-row.sum` — subtotal (bold, tinted background).
- `.stmt-row.final` — grand total (white text on `--gradient-primary` rounded pill, 22px display font).

**Income statement includes an `Incentives` section** with `Adjusted net income = Net income + Incentive Awards`. The Equity Changes statement reconciles against the adjusted figure.

CSV / PDF export buttons send the flattened `{label, value}` rows.

---

### 14. Incentives — `/incentives`

**Purpose:** Track supplier/manufacturer incentive targets and bookings.

**Layout:** three tabs — **Targets & Progress · Manage Targets · Booked Awards**.
- **Targets & Progress** — table of targets with a horizontal progress bar (green when achieved, violet→cyan otherwise), progress %, net qty sold, remaining-to-go badge.
- **Manage Targets** — CRUD form for ITEM/BRAND-basis targets, supplier link, period window, target qty, incentive amount.
- **Booked Awards** — record actual payouts (linked to a target or one-off), with totals card.

The Income Statement always shows a top-level Incentives line that sums all awards in the period.

---

### 15. Backups — `/backup` (sidebar → System)

**Purpose:** Snapshot the database to JSON, schedule daily backups, restore from a snapshot.

**Layout:**
- Page header: `⬇ Download snapshot` ghost CTA + `💾 Save backup now` primary CTA.
- **Status card** (Last backup · Today's backup chip · Saved-on path).
- **Schedule card** — hour-of-day input (0–23, default 20 = 8 PM), Save button. Stored in the `settings` table; the `BackupScheduler` cron polls hourly and creates an `AUTO` backup if (a) current hour matches AND (b) no backup has been taken today.
- **🔥 Restore from backup** card (red-bordered) — file picker for a `.json` snapshot, confirm input that requires typing `RESTORE`, big red "Restore now" button. Result banner shows rows restored per table.
- **History table** — last 200 backups: created · file name · source (AUTO/MANUAL chip) · size · notes · Download / Delete actions.

**Overdue prompt:** a `<BackupReminder>` mounted in `<Layout>` polls `/api/backup/status` every 5 minutes and shows a red banner above the main pane whenever today's backup is overdue. Dismissible per browser session.

---

## Cross-cutting features

### Export everywhere
Every list and statement exposes `CSV / PDF` buttons via `<ExportButtons>`. CSV is generated client-side as UTF-8 with BOM. PDF opens a print-friendly tab with the Hassan letterhead + timestamp and triggers `window.print()` — the user picks *Save as PDF*.

### Quick search everywhere
Items, Brands, Stores, Accounts, Customers, Suppliers, Categories, Stock Summary, and the Backup history all have a "Quick search" input that filters the list as you type.

### Close vs Delete
Items, customers, and suppliers all support a **Close** action (`isActive = false`) that hides the row from new transactions but keeps it in history. Backend delete is wrapped in `deleteOrConflict` ([erp-backend/src/common/delete-guard.ts](erp-backend/src/common/delete-guard.ts)) — DB foreign-key violations become friendly 409s pointing the user at Close.

### Theme
Light + dark, persisted in `localStorage.theme`, applied as `data-theme` on `<html>` by `ThemeContext`. Aurora and glass adapt per theme. Theme bootstrap script in `public/index.html` runs before React mounts so there's no flash.

### Mobile
Sidebar becomes a slide-in drawer ≤ 860px. Grids collapse, tables get horizontal scroll, POS stacks. `prefers-reduced-motion` disables aurora and card-lift animations.

---

## File-to-page map

| Page | File |
|---|---|
| Dashboard | [Dashboard.js](erp-frontend/src/pages/Dashboard.js) |
| POS | [POS.js](erp-frontend/src/pages/POS.js) |
| Catalogue hub | [MasterData.js](erp-frontend/src/pages/MasterData.js) |
| → Items panel | [components/master/ItemsPanel.js](erp-frontend/src/components/master/ItemsPanel.js) |
| → Categories panel | [components/master/CategoriesPanel.js](erp-frontend/src/components/master/CategoriesPanel.js) |
| Transactions hub | [Transactions.js](erp-frontend/src/pages/Transactions.js) |
| Sales | [Sales.js](erp-frontend/src/pages/Sales.js) |
| Sale Returns | [SaleReturns.js](erp-frontend/src/pages/SaleReturns.js) |
| Purchases / returns | [Purchases.js](erp-frontend/src/pages/Purchases.js), [PurchaseReturns.js](erp-frontend/src/pages/PurchaseReturns.js) |
| Receipts / payments | [Receipts.js](erp-frontend/src/pages/Receipts.js), [Payments.js](erp-frontend/src/pages/Payments.js) (both `<VoucherPage>`) |
| Fund Transfers | [FundTransfers.js](erp-frontend/src/pages/FundTransfers.js) |
| Cash Book | [CashRegister.js](erp-frontend/src/pages/CashRegister.js) |
| Stock | [Stock.js](erp-frontend/src/pages/Stock.js) |
| Stock Ledger | [StockLedger.js](erp-frontend/src/pages/StockLedger.js) |
| Customer / Supplier / Account ledger | [CustomerLedger.js](erp-frontend/src/pages/CustomerLedger.js), [SupplierLedger.js](erp-frontend/src/pages/SupplierLedger.js), [AccountLedger.js](erp-frontend/src/pages/AccountLedger.js) |
| Financials | [Financials.js](erp-frontend/src/pages/Financials.js) |
| Incentives | [Incentives.js](erp-frontend/src/pages/Incentives.js) |
| Backups | [Backup.js](erp-frontend/src/pages/Backup.js) |
| App shell | [components/Layout.js](erp-frontend/src/components/Layout.js) |
| Icons | [components/Icon.js](erp-frontend/src/components/Icon.js) |
| Theme | [theme/ThemeContext.js](erp-frontend/src/theme/ThemeContext.js) |
| Design tokens | [styles/tokens.css](erp-frontend/src/styles/tokens.css) |
| Layout classes | [styles/app.css](erp-frontend/src/styles/app.css) |
