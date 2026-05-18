# Hassan Electronics ERP — Design Reference

This is the **on-screen text + UI element catalogue** for the Hassan Electronics ERP / POS frontend. It documents — exhaustively, per page — every page heading, subtitle, button, input label, placeholder, table column, status chip, tab, modal, banner, validation message, and icon the user sees. Pair it with [README.md](./README.md) (functional / technical overview) and [CLAUDE.md](./CLAUDE.md) (project guide for contributors).

> **Source of truth.** Every quoted string in this document is lifted from the JSX in [erp-frontend/src/](erp-frontend/src/) and the hub definitions in [erp-frontend/src/nav/hubs.js](erp-frontend/src/nav/hubs.js). When the code and this file disagree, the code wins — update this file in the same commit that touches the JSX.

---

## 1. Design language

**Flat Windows 10 / Fluent.** The visual direction is deliberately conservative — Segoe UI, sharp 1px borders, solid surfaces, color-only state transitions. There is no border-radius, no glass / blur / aurora, no gradients on chrome, no transforms, no hover-lift animations anywhere in the app.

| Trait | Value |
|---|---|
| Corner radius | `0` on every chrome element. All `--radius*` tokens in [tokens.css](erp-frontend/src/styles/tokens.css) resolve to `0`. |
| Backdrop filter | `none` everywhere (`.card`, `.btn`, `.input`, `.modal-backdrop`, `.topbar`, `.sidebar`, `.search-results`, `.table-wrap`). |
| Aurora layer | Disabled: `body::before { display: none !important; }`. `--bg-aurora-1..4` all `transparent`. |
| Gradients | None on chrome. `--gradient-primary`, `--gradient-accent`, `--gradient-warm` resolve to solid colors. `.btn-primary::after` is suppressed. |
| Shadows | `--shadow-sm`, `--shadow`, `--gloss-top` are `none`. Only `--shadow-lg` is set (used by modals + login card). |
| Font (UI) | `Segoe UI Variable Text` → `Segoe UI` → system stack (`--font-body`). Display variant for headings (`--font-display`). |
| Font (numbers) | `Cascadia Code` → `Cascadia Mono` → `Consolas` (`--font-mono`). Used on SKUs, prices, refs, voucher numbers, dates in tables. |
| Heading sizes | `h1` 22 px · `h2` 18 px · `h3` 15 px. Body 14 px. Labels 11–13 px. |
| Spacing | Grid/flex gaps 6–14 px. Card padding 8–28 px. |

### Sidebar color tokens

Each sidebar entry carries its own hue used only for the 24×24 icon chip (tinted background + matching 22% border) and the 3 px left strip on the active row. The tokens in [tokens.css](erp-frontend/src/styles/tokens.css):

| Token | Hue | Used by |
|---|---|---|
| `--nav-dashboard` | `#0078d4` Windows blue | Dashboard |
| `--nav-pos` | `#c50f1f` brick red | POS Terminal |
| `--nav-cashbook` | `#107c10` forest green | Cash Book |
| `--nav-customer` | `#038387` teal | Customer hub |
| `--nav-sales` | `#e3008c` magenta | Sales hub |
| `--nav-supplier` | `#ca5010` burnt orange | Supplier hub |
| `--nav-purchase` | `#8764b8` lavender | Purchase hub |
| `--nav-item` | `#0099bc` sky blue | Item hub |
| `--nav-stock` | `#498205` moss green | Stock hub |
| `--nav-employee` | `#6b69d6` indigo | Employee hub |
| `--nav-account` | `#bf6b00` amber | Account hub |
| `--nav-users` | `#00b7c3` cyan | Users hub |
| `--nav-reports` | `#5c2e91` deep purple | Reports |
| `--nav-system` | `#5d5a58` gray | System hub |

### Semantic tokens

| Token | Hue | Meaning |
|---|---|---|
| `--success` | `#107c10` | Active / paid / found / received / approved |
| `--warning` | `#ca5010` | Partial / variance / pending |
| `--danger`  | `#c50f1f` | Closed / failed / overdue / damaged / rejected |
| `--info`    | `#0078d4` | Informational chips; also the active-tab underline |
| `--primary` | accent | Buttons, focus rings, active sidebar strip. Overrideable by the OS accent on Electron via `window.erpBridge.osAccent` + the Accent settings page. |

### Theme

Light + dark, persisted as `data-theme="light"|"dark"` on `<html>`. Storage key `hassan-theme` ([ThemeContext.js](erp-frontend/src/theme/ThemeContext.js)). A bootstrap script in [public/index.html](erp-frontend/public/index.html) applies the saved theme before React mounts so there is no flash. On Electron, theme changes IPC the title-bar overlay color via `window.erpBridge.setTitleBarTheme(theme)` so the Windows-drawn min/max/close area flips with the renderer.

---

## 2. Icon catalogue

Single source: [erp-frontend/src/components/Icon.js](erp-frontend/src/components/Icon.js). All icons are stroke-based SVG, 1.5 px stroke, currentColor. Used as `<Icon name="…" size={…}/>`. 49 names are registered.

| Group | Names |
|---|---|
| **Navigation** | `dashboard` (4-up grid) · `pos` (rectangle on stand) · `menu` (three lines) · `master` (three circles connected) · `tx` (dual arrows) · `search` (magnifier) |
| **Domain** | `user` · `users` · `package` / `box` (open box) · `packageX` (damaged box with X) · `card` (credit card with stripe) · `receipt` (folded receipt) · `transfer` / `swap` (dual arrows) · `bank` (column building) · `stock` / `boxes` (cube) · `cash` (till + coin) · `store` (storefront w/ canopy) · `warehouse` (loading bay) · `truck` · `ledger` / `book` · `backup` (stacked discs) · `reports` (line chart) · `chartBar` · `shield` (with check) · `incentive` (star) · `trophy` · `filter` (funnel) · `download` (arrow + line) · `rotate` (curved arrow, used for Sync) · `folderTree` · `tag` · `credit` (circle with in/out arrows) |
| **Brand / theme** | `sun` · `moon` · `bolt` (lightning) · `sparkles` (two stars) · `logo` (HE monogram — transparent, no chip ever) |
| **Chrome** | `chevron` · `chevronLeft` · `chevronRight` · `x` · `plus` · `minus` · `trash` · `arrow-up` · `arrow-down` · `arrow-right` · `arrowUpCircle` · `arrowDownCircle` |

**Logo treatment.** The `<Logo>` component renders the HE monogram (white H + half-white E strokes) as a plain `<img>` with **no chip / no backdrop wrapper** anywhere. The logo appears only on `/login` and `/request-access`. The wordmark "Hassan Electronics" appears in the sidebar brand block.

---

## 3. Application shell

The shell is rendered by [components/Layout.js](erp-frontend/src/components/Layout.js). CSS grid: sidebar (240 px, or 56 px rail) + main column (1fr). Topbar is sticky at 44 px.

```
┌──────────────┬────────────────────────────────────────────────┐
│              │ ☰  [GlobalSearch]                ↻ 🔔 ☀  user │ ← topbar
│   sidebar    ├────────────────────────────────────────────────┤
│   (240 px)   │  ⚠ Today's backup is overdue …  Dismiss        │ ← BackupReminder (conditional)
│              ├────────────────────────────────────────────────┤
│              │  Hub title                                     │
│              │  Hub subtitle                                  │
│              │  [Info] [Receipts] [Ledger]                    │ ← HubFrame tab strip
│              │  ───────────────────────────────               │
│              │                                                │
│              │  page content                                  │
└──────────────┴────────────────────────────────────────────────┘
```

### 3.1 Sidebar

Defined in [nav/hubs.js](erp-frontend/src/nav/hubs.js) (`SIDEBAR` array). Source rendered by [components/Layout.js](erp-frontend/src/components/Layout.js).

**Brand block** — top of sidebar, 56 px tall.

| Element | Text / icon |
|---|---|
| Logo | `<Logo>` (transparent HE monogram) |
| Wordmark | `"Hassan Electronics"` |
| Rail toggle | `<Icon name="menu" size={18}/>`, aria-label `"Expand sidebar"` / `"Collapse sidebar"`. Storage key `hassan-sidebar-rail`. |

**Navigation entries** — 14 items, in order. Each row is `.nav-item`; active row has `.active`, paints a 3 px solid `var(--nav-c)` left border, lifts background to `--surface-hover`, and bumps font-weight to 600. The 24×24 icon sits in `.nav-icon` (background `color-mix(in srgb, var(--nav-c) 16%, transparent)`, border 1 px at 22%).

| # | Label | Icon | Default route | Color |
|---|---|---|---|---|
| 1 | `"Dashboard"` | `dashboard` | `/` | `--nav-dashboard` |
| 2 | `"POS Terminal"` | `pos` | `/pos` | `--nav-pos` |
| 3 | `"Cash Book"` | `cash` | `/cash-register` | `--nav-cashbook` |
| 4 | `"Customer"` | `user` | `/customers` | `--nav-customer` |
| 5 | `"Sales"` | `receipt` | `/sales` | `--nav-sales` |
| 6 | `"Supplier"` | `package` | `/suppliers` | `--nav-supplier` |
| 7 | `"Purchase"` | `package` | `/purchase-orders` | `--nav-purchase` |
| 8 | `"Item"` | `package` | `/items` | `--nav-item` |
| 9 | `"Stock"` | `stock` | `/stock` | `--nav-stock` |
| 10 | `"Employee"` | `users` | `/employees` | `--nav-employee` |
| 11 | `"Account"` | `bank` | `/accounts` | `--nav-account` |
| 12 | `"Users"` | `users` | `/users-change-password` (non-admins) / `/users` (admins) | `--nav-users` |
| 13 | `"Reports"` | `reports` | `/financials` | `--nav-reports` |
| 14 | `"System"` | `backup` | `/backup` | `--nav-system` |

**Mobile (≤ 860 px)** — sidebar becomes a fixed off-canvas drawer (`transform: translateX(-100%)` → `0` when `[data-nav="open"]` on `.app`). Tap-scrim closes the drawer.

### 3.2 Topbar

Sticky, 44 px, background `var(--surface-elev)`, no border-bottom. Left-to-right:

| Element | Text / state |
|---|---|
| Mobile menu button (≤ 860 px) | `<Icon name="menu" size={18}/>`, aria-label `"Open menu"`. |
| **GlobalSearch** (omnibox) | `<Icon name="search" size={15}/>` + input. Placeholder `"Search by code, name, phone, SKU…"`. Searches customers, suppliers, employees, accounts, items. Result kind chip texts: `"Customer"`, `"Supplier"`, `"Employee"`, `"Account"`, `"Item"`. Popover empty states: `"Loading…"`, `"No matches."`, plus the backend error message on failure. |
| Spacer | flex: 1 |
| **SyncButton** | `<Icon name="rotate" size={16}/>` (spins on busy). Hidden entirely when `CLOUD_SYNC_URL` is not configured. Title attribute is one of `"Syncing…"`, `"Sync now — N event pending"` / `"Sync now — N events pending"`, `"Sync now — outbox is empty"`. Pending count appears as a red badge (capped `"99+"`). 3-second flash pill after a sync: success `"Sync complete."`, warn `"Cloud sync URL not configured."`, error `"Sync failed."` — or the backend's `summary.message`. Polls `GET /sync/status` every 30 s. |
| **LoginBell** (superuser only) | 🔔 emoji. Title `"Login notifications"`. Red badge for `pendingRequests + newLogins`. Panel on click: headings `"Pending access requests (N)"` / `"Recent logins"`, empty states `"None."` / `"No new logins."`, link `"Review in Users"`. |
| **ThemeToggle** | `<Icon name="sun" size={16}/>` when dark, `<Icon name="moon" size={16}/>` when light. aria-label `"Switch to light mode"` / `"Switch to dark mode"`. Title `"Light mode"` / `"Dark mode"`. |
| **UserChip** | `<Icon name="user"/>` + `username` (bold) + `· admin` (muted, if superuser). Trailing button `"Logout"` (title `"Sign out"`). |

**Logout confirm modal** (renders on Logout click):

```
Sign out?
You're about to sign {username} out of Hassan Electronics ERP.
Any unsaved work on the current page will be lost.

[Stay signed in]    [Sign out]      ← btn-danger
```

The cancel button is autofocused. Modal width `min(380px, 92vw)`.

### 3.3 BackupReminder banner

Mounted in `<Layout>`, polls `GET /backup/status` every 5 minutes. Renders only when `status.overdue === true` and the user has not dismissed in the current browser session (sessionStorage key `backup-reminder-dismissed`).

```
⚠ Today's backup is overdue — scheduled for {HH}:00. Take it now    [Dismiss]
```

`"Take it now"` is a `<Link to="/backup">`; the banner is `.alert.alert-error` style with a 3 px left border in `var(--danger)`.

### 3.4 HubFrame (title + tab strip)

Wrapper for every hub. File [components/HubFrame.js](erp-frontend/src/components/HubFrame.js). Renders:

```html
<header class="hub-head">
  <h1>{title}</h1>            ← e.g. "Customers"
  <p>{subtitle}</p>            ← e.g. "Customer info, receipts received, and per-customer ledger."
</header>
<nav class="hub-tabs" aria-label="Section tabs">
  ← horizontal tab strip — 14 px icon + label; underlined when active (2 px `--info`)
</nav>
<div class="hub-body"><Outlet/></div>
```

Tabs marked `superuserOnly` in [nav/hubs.js](erp-frontend/src/nav/hubs.js) are filtered out for regular users.

### 3.5 Unsaved-changes guard

Hook: [hooks/useUnsavedChangesPrompt.js](erp-frontend/src/hooks/useUnsavedChangesPrompt.js). Fires on `beforeunload` and on react-router navigation while a form is dirty.

> "You have unsaved changes. Leave this page and discard them?"

---

## 4. Authentication screens

### 4.1 Sign in — `/login`

File [pages/Login.js](erp-frontend/src/pages/Login.js). Centered card, `min(420px, 96vw)`, 1 px solid `--border-strong` border, `--shadow-lg` shadow, 28 px padding. Background `--bg`.

- **Theme toggle** at top-right (absolute, top: 10, right: 10) — same `<ThemeToggle>`.
- **Logo** centered, 72 px transparent monogram.
- **Heading:** `"Sign in"`
- **Subtitle (muted):** `"Welcome to Hassan Electronics ERP. Use the credentials provided by your administrator."`

| Field | Label | Attributes |
|---|---|---|
| Username | `"Username"` | `autoFocus`, `autoComplete="username"` |
| Password | `"Password"` | `type="password"`, `autoComplete="current-password"` |

- **Error banner:** `<div class="alert alert-error">` showing `err.uiMessage` or `"Sign-in failed"`.
- **Primary button:** `"Sign in"` (busy → `"Signing in…"`).
- **Aside link:** `"Don't have an account?"` + `"Request access"` (btn-link, switches the card to Request Access mode).

### 4.2 Request access — `/request-access`

Same card, mode swapped in-place.

- **Heading:** `"Request access"`
- **Subtitle (muted):** `"Tell the administrator who you are. They'll review your request and assign you a username + password."`

| Field | Label | Attributes |
|---|---|---|
| Desired username | `"Desired username *"` | required, minLength 2 |
| Full name | `"Full name *"` | required, minLength 2 |
| Phone | `"Phone"` | optional |
| Email | `"Email"` | optional |
| Reason | `"Reason / role you'd take on"` | textarea, 3 rows, placeholder `"e.g. Cashier on the POS terminal, Saturday shift"` |

- **Error banner:** `err.uiMessage` or `"Could not submit request"`.
- **Buttons:** `"Submit request"` (busy → `"Submitting…"`), `"Cancel"` (`btn btn-ghost`).

**Success state** (after submit):

```
Request received
The administrator has been notified. You'll be able to sign in once
your request is approved and a password is assigned to you.

[Back to sign in]
```

---

## 5. Pages

The next sections walk through every page in the order they appear in the sidebar.

---

### 5.1 Dashboard — `/`

File [pages/Dashboard.js](erp-frontend/src/pages/Dashboard.js).

**Header**

| Element | Text |
|---|---|
| Title | `"Today at the shop"` |
| Subtitle | dynamic, e.g. `"Sunday, 18 May 2026"` |
| Right action | `"Export"` button with `<Icon name="download"/>` |

**4-up stat row** (`.grid-stat`)

| Card | Label | Unit | Footer | Indicator |
|---|---|---|---|---|
| 1 | `"Today's sales"` | `"Rs"` | `"N invoices today"` | ▲ |
| 2 | `"Cash in till"` | `"Rs"` | `"N entries"` | ▲ |
| 3 | `"Items low on stock"` | — | `"N critical"` | ▼ |
| 4 | `"Adjusted Net Income (MTD)"` | `"Rs"` | `"+ Rs X incentives"` or `"No incentives yet"` | ▲ |

**Revenue card**

- Heading `"Revenue, last 14 days"`, sub-line `"Net of returns & discounts"`.
- Range toggles: `"14d"` / `"30d"` / `"90d"`.
- Empty state `"Not enough data yet"`.

**Latest activity card**

- Heading `"Latest activity"`, sub-line `"Sales · returns · receipts · transfers"`.
- States `"Loading…"` / `"No recent activity yet."`.
- Row format: 36 px icon chip (icon picked by method — `package`/`receipt`/`transfer`/`card`) · party + ref · amount · status chip.
- Status chips: `"Paid"` (success) · `"Partial"` (warn) · `"Unpaid"` (info) · `"Received"` (info) · `"Purchase"` (info) · `"Transferred"` (violet).

**Top selling card**

- Eyebrow `"Top selling — last 14 days"`.
- Row: `{name}` · `"N sold"`.
- Empty state `"No sales in the last fortnight."`.

**Receivables · Payables card**

- Eyebrow `"Receivables · Payables"`.
- Row 1: `"Owed to you"` → `↗` (arrow-up).
- Row 2: `"You owe"` → `↘` (arrow-down).

**Incentive card**

- Eyebrow `"Incentive · this period"`.
- With active target: heading `"{target.name}"` (or `"Active target"`), sub-line `"{netQty} / {targetQty} units sold · Rs {potentialIncentive} unlocks at {targetQty}"`, button `"View progress"`.
- Without target: `"No active targets"` + `"Set up a target to track manufacturer incentives."` + button `"Add target"`.

---

### 5.2 POS Terminal — `/pos`

File [pages/POS.js](erp-frontend/src/pages/POS.js).

**No-session state** (open the day before billing)

- Title `"POS"`.
- Card heading `"Start a POS Session"`.
- Body `"Open a cashier session before billing. Cart and totals are tracked per session."`.
- Fields: `"Store (optional)"` (default option `"— None —"`), `"Opening cash float"`.
- Button `"Start Session"`.

**Active session header**

- Title `"POS"`.
- Muted meta `"Session {id} · started {time} · {salesCount} sales · {salesTotal}"`.
- Button `"Close Session"`.

**Success banner after a sale**

```
Sale {invoiceNo} saved — net {net}, paid {paid}[ · Change due: {change}]
[Print receipt]
```

**Scan card**

- Input placeholder `"Type model no. — e.g. DAWLANCE LVS-15"`.
- Scan error chip (red) shows the backend error, e.g. `"Item not found"`.

**Cart table**

| Column | Header |
|---|---|
| Item | model no. (bold) + brand (muted mono, 11 px) |
| Qty | `−` / number / `+` stepper |
| Price | mono, right-aligned |
| Total | mono, right-aligned |
| — | `×` delete button |

Empty cart: `"Cart is empty. Type a model no. above to add."`

**Checkout sidebar**

- Heading `"Checkout"`.
- Lines: `"Subtotal"` · `"Discount"` (input, `placeholder="0.00"`) · `"Net"` · `"Paid"` (input, default = net) · one of `"Receivable"` / `"Change"` / `"Due"`.
- Conditional alert: credit sale → `"Full {amount} will be added to customer's A/R."`; partial → `"{receivable} will be added to customer's A/R."`.
- `"Customer"` selector — default `"— Walk-in —"`; `+` button title `"Add new customer"`.
- Payment method section labelled `"Payment method"`. Four buttons: `"CASH"`, `"CARD"`, `"BANK"`, `"CREDIT"`.
- Account selector: label `"Cash drawer"` (CASH) or `"Deposit to"` (CARD/BANK). Default `"— Select account —"`. Option format `"{name} · {bank} ({type})"`. When the relevant account type is missing: `"No {cash|bank|wallet} account configured. Add one under Master Data → Bank / Wallet."`.
- Checkout error alert prints the backend message, e.g. `"Pick a customer for credit sales — the full amount becomes their receivable."`.
- Action row: `"Clear"` (ghost) + `"Checkout · {net}"` (busy → `"Saving…"`).

**New Customer modal**

- Title `"New Customer"`. Fields `"Name *"` (autoFocus, required), `"Phone"`, `"Email"`, `"Address"` (textarea). Buttons `"Cancel"`, `"Create"` (busy → `"Saving…"`). Error: `"Could not create customer"` (or backend message).

---

### 5.3 Cash Book — `/cash-register`

File [pages/CashRegister.js](erp-frontend/src/pages/CashRegister.js).

**Header**

- Title `"Cash book — {date}"`.
- Subtitle `"Session-based daily till · running balance per row"`.
- Right buttons (conditional):
  - No session, today → `"▶ Open Today's Register"`.
  - Session open → `"■ Close Register"`.
  - Session exists → `"+ New Entry"` (disabled when closed; disabled title `"Register is closed for this date"`).

**Date picker card**

- Label `"Date"`, button `"Refresh"` (busy → `"Loading…"`).

**No-session banners**

- Today: heading `"Register not opened for today"`, body `"Expected opening cash (carried over from prior day): {amount}. Click Open Today's Register to count physical cash and start the day."`.
- Past date: heading `"No session for {date}"`, body `"This date didn't have a register session opened. Computed opening from prior-day balance: {amount}."`.

**Session banner** (when a session exists)

- Format `"Session {sessionDate} · OPEN|CLOSED"`.
- Detail line `"Expected opening {amount} · Actual {amount} · {no difference | diff}"` + (if closed) `"· Closing {amount} ({matched | diff})"`.
- Status chip: `"No discrepancies"` (success) or `"Variance recorded"` (warn).

**4-up stats** — `"Opening Cash"`, `"Cash In"` (green orb), `"Cash Out"` (red orb), `"Closing Cash"`. All prefixed `"Rs"`.

**Activity table**

| Column | Notes |
|---|---|
| `"Time"` | `toLocaleTimeString()` |
| `"Ref"` | mono |
| `"Category"` | badge — `"MISC"` red, others gray |
| `"Description"` | text |
| `"In"` | right-aligned |
| `"Out"` | right-aligned |
| `"Running"` | right-aligned, bold |
| — | `"Delete"` (only on `source === 'CASH_ENTRY'` rows) |

Empty state: `"No cash activity on this date."`

**Open Register modal**

- Title `"Open Cash Register — {date}"`.
- Fields: `"Expected Opening (from prior day)"` (read-only), `"Actual Cash Counted *"` (autoFocus), `"Difference"` (read-only, color-coded).
- Conditional alerts:
  - Shortfall: `"Short by {amount}. You can book a transfer (e.g. from Capital → Cash) to cover it before opening, or just open with the actual amount and reconcile later."`
  - Overage: `"Over by {amount} — recount before opening, or book the surplus as a Capital injection / cash IN entry afterwards."`
- Checkbox `"Book a fund transfer along with opening"`. When ticked:
  - `"From Account *"` (default `"— Select —"`, option fmt `"{name} ({type})"`)
  - `"To Account *"` (same)
  - `"Amount *"` (min 0.01)
  - `"Transfer Notes"` (placeholder `"e.g. Capital injection to cover shortfall"`)
- `"Opening Notes"` textarea (placeholder `"Anything worth recording about today's opening?"`).
- Buttons `"▶ Open Register"` (busy → `"Opening…"`), `"Cancel"`.
- Error example: `"Transfer requires distinct from/to accounts and a positive amount"`.

**Close Register modal**

- Title `"Close Cash Register — {sessionDate}"`.
- Fields `"Expected Closing"` (read-only), `"Actual Cash Counted *"` (autoFocus), `"Difference"` (read-only), `"Closing Notes"` (textarea).
- Buttons `"■ Close Register"` (busy → `"Closing…"`), `"Cancel"`. Error → `"Save failed"` or backend message.

**New Cash Entry modal**

- Title `"New Cash Entry"`.
- Fields:
  - `"Date *"`
  - `"Direction *"` — options `"Cash Out (paid out)"`, `"Cash In (received)"`
  - `"Category *"` — options `"Expense (rent, tea, transport…)"`, `"Miscellaneous (unclassified)"`, `"Opening adjustment"`, `"Closing adjustment"`, `"Other"`
  - `"Amount *"` (min 0.01)
  - `"Account"` (default `"— None —"`, option fmt `"{name} ({type})"`)
  - `"Description"` (placeholder `"What was this cash for?"`)
  - `"Notes"` (textarea)
- MISC alert: `"Heads up: Miscellaneous entries are flagged in the day's report. Prefer a specific category if you can identify what this cash was spent on."`
- Buttons `"Save Entry"` (busy → `"Saving…"`), `"Cancel"`.

---

### 5.4 Customer hub — `/customers`

Hub title `"Customers"` · subtitle `"Customer info, receipts received, and per-customer ledger."`

Tabs: **Info · Receipts · Ledger**.

#### Tab — Info (`/customers`)

Panel inside [pages/MasterData.js](erp-frontend/src/pages/MasterData.js) (`CustomersPanel`).

- Panel heading `"Customers"`.
- Toolbar: `<ExportButtons>` (`"CSV"`, `"PDF"`) + `"+ Add Customer"`.
- Search row: label `"Quick search"`, placeholder `"Type code, name, phone, email, or address…"`. Result summary: `"{filtered} of {total}"`.

Form (`"New"` / `"Edit"`):

| Field | Label | Notes |
|---|---|---|
| Code | `"Code"` | placeholder `"Auto-generated if blank"` |
| Name | `"Name *"` | required |
| Phone | `"Phone"` | |
| Email | `"Email"` | |
| Opening Balance | `"Opening Balance"` | |
| Address | `"Address"` | textarea |
| Active | `"Active"` | checkbox |

Buttons `"Create"` / `"Update"`, `"Cancel"`.

Table columns: `"Code"` · `"Name"` · `"Phone"` · `"Email"` · `"Opening"` · `"Balance"` · `"Status"` · `"Actions"`. Balance label helper: `"Owes us"` / `"We owe them"` / `"Settled"`. Status badge `"CLOSED"` for closed rows. Row actions `"Ledger"`, `"Edit"`, `"Close"` / `"Reopen"`, `"Delete"`. Close title: `"Mark as closed (kept in records, hidden from new transactions)"`. Reopen title: `"Reopen this party"`. Empty state `"No records yet."` or `"No matches."`.

#### Tab — Receipts (`/receipts`)

Renders [components/VoucherPage.js](erp-frontend/src/components/VoucherPage.js) with `direction="IN"`.

- Heading `"Receipts"`, button `"+ New Receipt"`.
- Form title `"New Receipt Voucher"`.
- Fields:
  - `"Customer *"` — default `"— Select —"`. Inline hint: `"Settled."` / `"Outstanding A/R: {amount}"` / `"Customer credit: {amount}"`.
  - `"Account *"`
  - `"Amount *"`
  - `"Notes"`
- Buttons `"Save Voucher"`, `"Cancel"`.
- Table columns: `"Voucher #"`, `"Date"`, `"Customer"`, `"Account"`, `"Amount"`, `"Notes"`.
- States `"Loading…"`, `"No vouchers yet."`.

#### Tab — Ledger (`/customer-ledger`)

File [pages/CustomerLedger.js](erp-frontend/src/pages/CustomerLedger.js).

- Heading `"Customer Ledger"`.
- Customer picker: placeholder `"— Select customer —"`.
- Selected card: name (h3), contact line with `" · "` separator, fallback `"—"` for missing phone/email.
- Empty state `"Select a customer to view their ledger."`.
- Ledger body rendered by `<LedgerView>` (see Account hub for the shared layout: opening balance / current balance stripe, then Date · Ref · Description · Debit · Credit · Balance rows).

---

### 5.5 Sales hub — `/sales`

Hub title `"Sales"` · subtitle `"Posted invoices and sale returns."`. Tabs: **History · Returns**.

#### Tab — History (`/sales`)

File [pages/Sales.js](erp-frontend/src/pages/Sales.js).

- Heading `"Sales History"`.
- Search placeholder `"Search invoice, customer, method..."`.
- Info banner: `"Sales are created at the POS terminal. This page is a read-only history. For collections, use the Customer → Receipts tab — the Customer Ledger tab shows the net A/R balance per customer."`
- Columns: `"Invoice #"`, `"Date"`, `"Customer"`, `"Total"`, `"Net"`, `"Paid at sale"`, `"Method"`, `"Actions"`.
- Row action: `"Print"`.
- States: `"Loading…"`, `"No sales yet."`, `"No sales match your search."`.

#### Tab — Returns (`/sale-returns`)

File [pages/SaleReturns.js](erp-frontend/src/pages/SaleReturns.js).

- Heading `"Sale Returns"`, button `"+ New Sale Return"`.
- Form title `"New Sale Return"`. Fields `"Customer"` (default `"— None —"`), `"Store"` (default `"— Default —"`), `"Reason"`.
- Line items table: `"Item"`, `"Qty"`, `"Unit Price"`, `"Line Total"` + `×` per row. `"+ Add Line"` below. `"Total Returned"` summary.
- Buttons `"Save Return"`, `"Cancel"`.
- Validation: `"At least one line is required"`.
- List columns: `"Return #"`, `"Date"`, `"Customer"`, `"Total"`, `"Reason"`. Empty: `"No sale returns yet."`.

---

### 5.6 Supplier hub — `/suppliers`

Hub title `"Suppliers"` · subtitle `"Supplier info, brands, money out, incentives, and ledger."`. Tabs: **Info · Brands · Payments · Incentives · Ledger**.

#### Tab — Info (`/suppliers`)

Same panel shape as Customer → Info. Button `"+ Add Supplier"`. Balance helper: `"We owe them"` / `"They owe us"` / `"Settled"`.

#### Tab — Brands (`/brands`)

Panel in MasterData.js.

- Tile heading `"Brands"`, description `"Manufacturer brand list with descriptions."`.
- Form fields `"Name"` (required), `"Description"`, `"Active"` (checkbox, default on).
- Table columns `"Name"` · `"Description"` · `"Active"` (badge `"Yes"` / `"No"`).

#### Tab — Payments (`/payments`)

`<VoucherPage direction="OUT">`. Heading `"Payments"`, button `"+ New Payment"`, form title `"New Payment Voucher"`.

- Party label `"Supplier *"`. Hints: `"Settled."` / `"Outstanding A/P: {amount}"` / `"Supplier owes us: {amount}"`.
- Otherwise identical to Receipts (account, amount, notes; columns Voucher #/Date/Supplier/Account/Amount/Notes).

#### Tab — Incentives (`/incentives`)

File [pages/Incentives.js](erp-frontend/src/pages/Incentives.js). Three sub-tabs: **Targets & Progress · Manage Targets · Booked Awards**.

**Targets & Progress** — columns `"Target"`, `"Basis"`, `"Period"`, `"Target Qty"`, `"Net Sold"`, `"Progress"`, `"Incentive"`, `"Status"`. Status badge `"✔ Achieved"` (green) or `"N to go"` (gray). Empty: `"No incentive targets set yet. Add one under "Manage Targets"."` Progress bar shows `"{progressPct}%"` to the right.

**Manage Targets** — heading `"Incentive Targets"`, button `"+ New Target"`. Form `"New Target"` / `"Edit Target"`:

| Field | Label / placeholder |
|---|---|
| Name | `"Name *"` — placeholder `"e.g. Q3 Inverter Push"` |
| Basis | `"Basis *"` — options `"Specific Item"`, `"Entire Brand"` |
| Item (if ITEM) | `"Item *"` — `"— Select —"` |
| Brand (if BRAND) | `"Brand *"` — `"— Select —"` |
| Supplier | `"Supplier (optional)"` — `"— None —"` |
| Period Start | `"Period Start *"` |
| Period End | `"Period End *"` |
| Target Qty | `"Target Quantity *"` |
| Incentive Amount | `"Incentive Amount *"` |
| Notes | `"Notes"` — placeholder `"e.g. Selling at Rs.5000 loss is acceptable — Rs.8000 incentive unlocks at 50 units"` |
| Active | `"Active"` (checkbox) |

Buttons `"Create"`/`"Update"`, `"Cancel"`. Table columns `"Name"`, `"Basis"`, `"Period"`, `"Target Qty"`, `"Incentive"`, `"Status"`, `"Actions"`. Status badge `"Active"` (green) / `"Inactive"`. Row actions `"Edit"`, `"Delete"`. Empty: `"No targets yet."`.

**Booked Awards** — heading `"Booked Incentive Awards"`, button `"+ Book Award"`. Form `"Book Incentive Award"`:

- `"Linked Target (optional)"` — `"— None / one-off —"`
- `"Label *"` — placeholder `"e.g. Q3 Inverter Push payout"`
- `"Awarded On *"`
- `"Amount *"`
- `"Period Start"` / `"Period End"`
- `"Notes"`

Buttons `"Save Award"`, `"Cancel"`. Summary line `"Total Booked: {amount}"`. Columns `"Awarded On"`, `"Label"`, `"Linked Target"`, `"Period"`, `"Amount"`, `"Actions"`. Row action `"Delete"`. Empty: `"No awards booked yet."`.

#### Tab — Ledger (`/supplier-ledger`)

Mirror of Customer Ledger. Heading `"Supplier Ledger"`, picker `"— Select supplier —"`, empty `"Select a supplier to view their ledger."`.

---

### 5.7 Purchase hub — `/purchase-orders`

Hub title `"Purchases"` · subtitle `"Orders raised, bills posted, and purchase returns."`. Tabs: **Orders · Bills · Returns**.

#### Tab — Orders (`/purchase-orders`)

File [pages/PurchaseOrders.js](erp-frontend/src/pages/PurchaseOrders.js).

- Page title `"Purchase orders"`, description `"Orders placed with suppliers — Draft → Sent → Received."`.
- Toolbar: `<ExportButtons>` + `"+ New purchase order"`.
- Form `"New purchase order"`:
  - `"Supplier *"` (default `"— Select —"`)
  - `"Order date *"`
  - `"Expected delivery"`
  - `"Status"` (options `"Draft"`, `"Sent to supplier"`, `"Received"`, `"Cancelled"`)
  - Line items section `"Line items"` — table columns `"Item"` (default `"— Select —"`), `"Qty"`, `"Expected unit cost"`, `"Line total"` + `×` delete. Add row button `"+ Add line"`. Total line `"Total: Rs {value}"`. Field `"Notes"`.
- Buttons `"Save PO"`, `"Cancel"`. Validation: `"Add at least one line item with an item, quantity and cost."`.
- List columns: `"PO #"`, `"Order date"`, `"Expected"`, `"Supplier"`, `"Items"`, `"Total"`, `"Status"`, `"Actions"`. Status chips: Draft (plain), Sent (`chip-info`), Received (`chip-success`), Cancelled (`chip-danger`). Row actions: `"Send"` (Draft), `"Mark received"` (Sent), `"Cancel"` (Draft/Sent), `"Delete"` (always). Confirmations: `"Mark PO {poNo} as {status}?"`, `"Delete PO {poNo}? This can't be undone."`. Empty: `"No purchase orders yet."`.

#### Tab — Bills (`/purchases`)

File [pages/Purchases.js](erp-frontend/src/pages/Purchases.js).

- Heading `"Purchases"`, button `"+ New Purchase"`.
- Info banner: `"Bills aren't paid one-for-one. To pay suppliers, use the Payments tab — the Supplier Ledger tab shows the net balance you owe."`
- Form `"New Purchase"`:
  - `"Supplier"` (default `"— None —"`)
  - `"Default Store (per-line below can override)"` (default `"— Default —"`)
  - `"Payment Method"` — `"Cash"` / `"Bank"` / `"Credit"`
  - Line items: `"Item"` (default `"— Select —"`) with inline `"+ New"` button (title `"Create a new item without leaving this form"`), `"Store"` (default `"— Default —"` / `"— None —"`, title `"Which store these go to"`), `"Qty"`, `"Unit Price"`, `"Line Total"`, `×` delete.
  - `"+ Add Line"` button.
  - Summary: `"Discount"`, `"Total"`, `"Net"`, `"Paid Amount"` (placeholder `"0.00"`).
  - `"Notes"` textarea.
- Buttons `"Save Purchase"`, `"Cancel"`.

**Quick-add Item modal** (`+ New`):

- Title `"Quick add item"`.
- Fields: `"Model No"` (placeholder `"e.g. WRG-475LP"`), `"Name (optional, defaults to Model No)"`, `"Brand"`, `"SKU (auto-derived if blank)"`, `"Barcode"`, `"Purchase price"`, `"Sale price"`.
- Buttons `"Save item & use on this line"` (busy → `"Saving…"`), `"Cancel"`.
- Validation: `"Model No or Name is required"`.

List columns: `"Bill #"`, `"Date"`, `"Supplier"`, `"Total"`, `"Net"`, `"Paid at bill"`, `"Method"`, `"Actions"`. Row action `"Print"`. Empty: `"No purchases yet."`.

#### Tab — Returns (`/purchase-returns`)

File [pages/PurchaseReturns.js](erp-frontend/src/pages/PurchaseReturns.js). Mirrors Sale Returns:

- Heading `"Purchase Returns"`, button `"+ New Purchase Return"`.
- Form `"New Purchase Return"`: `"Supplier"` (`"— None —"`), `"Store"` (`"— Default —"`), `"Reason"`, lines with `"Item"` (`"— Select —"`)/`"Qty"`/`"Unit Price"`/`"Line Total"`, `"+ Add Line"`, `"Total Returned"`. Buttons `"Save Return"`, `"Cancel"`. Validation `"At least one line is required"`.
- List columns: `"Return #"`, `"Date"`, `"Supplier"`, `"Total"`, `"Reason"`. Empty: `"No purchase returns yet."`.

---

### 5.8 Item hub — `/items`

Hub title `"Items"` · subtitle `"Item catalogue and category tree."`. Tabs: **Catalogue · Categories**.

#### Tab — Catalogue (`/items`)

[components/master/ItemsPanel.js](erp-frontend/src/components/master/ItemsPanel.js).

- Panel heading `"Items"`.
- Toolbar: search label `"Quick search"`, placeholder `"Type a model no., name, SKU, barcode, or brand…"`. `<ExportButtons>` + `"+ Add Item"`.

Form `"New Item"` / `"Edit Item"`:

| Field | Label | Notes |
|---|---|---|
| Model No. | `"Model No. *"` | placeholder `"e.g. DAWLANCE LVS-15"`, hint `"The model number is used as this item's name. SKU is auto-generated from it."` |
| Brand | `"Brand"` | default `"— None —"` |
| Purchase Price | `"Purchase Price"` | |
| Sale Price | `"Sale Price"` | |
| Unit | `"Unit"` | |
| Min Stock Level | `"Min Stock Level"` | |
| Active | `"Active"` | checkbox |
| **Advanced toggle** | `"+ Advanced (override SKU)"` ↔ `"− Hide advanced"` | reveals: |
| SKU | `"SKU (override)"` | placeholder `"Auto-derived from Model No. when blank"`, hint `"Stock Keeping Unit — internal unique code. Leave blank to let the system match it to your Model No."` |
| Categories | `"Categories"` | multi-select; empty notice `"No categories yet. Add some in the Categories tile first."` |

Buttons `"Create"` / `"Update"`, `"Cancel"`. Validation: `"Model No. is required"`, `"Save failed"`.

Table columns: `"Model No."` · `"Brand"` · `"Categories"` · `"Purchase"` · `"Sale"` · `"Unit"` · `"Min"` · `"Status"` · `"Actions"`. Status chips: `"Active"` (success) / `"Closed"` (plain). Row actions `"Edit"`, `"Close"`/`"Reopen"`, `"Delete"`. Empty: `"No items yet."` / `"No items match your search."`.

#### Tab — Categories (`/categories`)

[components/master/CategoriesPanel.js](erp-frontend/src/components/master/CategoriesPanel.js).

- Panel heading `"Categories"`.
- Search label `"Quick search"`, placeholder `"Type a category name or description…"`.
- Button `"+ Add Category"`.

Form `"New Category"` / `"Edit Category"`:

- `"Name"` (required)
- `"Parent Category"` (default `"— Top Level —"`)
- `"Active"` (checkbox)
- `"Description"` (textarea)

Buttons `"Create"`/`"Update"`, `"Cancel"`. Delete confirmation: `"Delete "{name}"? Sub-categories will be re-parented to root."`. Validation: `"Save failed"`.

Tree rows use a `"› "` prefix per depth level. Inactive rows get an `"inactive"` badge. Empty: `"No categories yet."` / `"No matches."`.

---

### 5.9 Stock hub — `/stock`

Hub title `"Stock"` · subtitle `"On-hand summary, movement history, transfers, and damaged goods."`. Tabs: **Summary · Stores · Ledger · Transfers · Damaged**.

#### Tab — Summary (`/stock`)

File [pages/Stock.js](erp-frontend/src/pages/Stock.js).

- Title `"Stock summary"`, subtitle `"On-hand vs minimum per item · low-stock alerts highlighted"`.
- Toolbar: search label `"Quick search"`, placeholder `"Search by item name or SKU…"`. `<ExportButtons>` (file `stock_summary`). Button `"+ Adjust Stock"`.
- Table: `"Item"` · `"SKU"` · `"On Hand"` · `"Min Level"` · `"Status"`. Status chips `"Low"` (red), `"OK"` (green). Empty: `"No stock items match your search."` / `"No stock data."`.

**Manual Stock Adjustment modal**

- Title `"Manual Stock Adjustment"`.
- Fields:
  - `"Item *"` — `"— Select —"`, hint `"Currently on hand: {onHand}"`.
  - `"Reason *"` — `"— Why is the count changing? —"`. Options:
    - `"Loss / stolen / missing"` (OUT)
    - `"Damaged / unsellable"` (OUT)
    - `"Stock count — was over"` (OUT)
    - `"Found / mis-shelved"` (IN)
    - `"Stock count — was under"` (IN)
    - `"Correction (add)"` (IN)
    - `"Correction (remove)"` (OUT)
  - Reason hint `"This is a stock OUT|IN movement."`.
  - `"Quantity *"` (min 1).
  - `"Extra note"` (placeholder `"optional — e.g. unit 3 had a cracked screen"`).
- Live preview: `"After adjustment: {projected}"`.
- Negative-stock guard: `"This would push on-hand below zero. Either reduce the quantity or pick a different reason."`
- Buttons `"Save Adjustment"`, `"Cancel"`.
- Validation: `"Please select an item."`, `"Please pick a reason — it determines whether to add or remove stock."`, `"Quantity must be at least 1."`, `"This would drive stock negative (currently {onHand}). Please re-check the quantity."`.

#### Tab — Stores (`/stores`)

Panel in MasterData.js. Title `"Stores / Branches"`. Form fields `"Name"` (required), `"Location"`, `"Active"` (default on). Columns `"Name"` · `"Location"` · `"Active"` (badge `"Yes"`/`"No"`).

#### Tab — Ledger (`/stock-ledger`)

File [pages/StockLedger.js](erp-frontend/src/pages/StockLedger.js).

- Title `"Stock Ledger"`. Subtitle on export: `"Total IN {x} · Total OUT {y} · Net {z}"`. File `stock_ledger`.
- Filter row: `"Item"` (`"— Any —"`), `"Category"` (`"— Any —"`), `"Brand"` (`"— Any —"`), `"Supplier"` (`"— Any —"`), `"From"`, `"To"`, button `"Run"`.
- Table: `"Date"` · `"Item"` · `"SKU"` · `"Store"` · `"Type"` (IN/OUT chip) · `"Qty"` · `"Reference"` · `"Running Balance"`.

#### Tab — Transfers (`/stock-transfers`)

File [pages/StockTransfers.js](erp-frontend/src/pages/StockTransfers.js).

- Title `"Stock transfers"`, subtitle `"Move inventory between stores. Each transfer is atomic — OUT from source, IN to destination, or nothing."`.
- Button `"+ New transfer"` (disabled when < 2 stores). Warn chip: `"Stock transfers need at least two stores. Add another store first."`.
- Form `"New stock transfer"`: `"From store *"` (`"— Select —"`), `"To store *"` (`"— Select —"`), `"Date"`, `"Notes"`, line items table (`"Item"` `"— Select —"`, `"Quantity"` default 1, remove button per row), `"+ Add line"`.
- Buttons `"Save Transfer"`, `"Cancel"`. Validation: `"Source and destination stores must differ"`, `"Add at least one item with quantity"`, `"Save failed"`.
- Columns: `"Transfer #"` · `"Date"` · `"From"` · `"To"` · `"Notes"` · `"Actions"` (Delete). Empty: `"No transfers yet."`.

#### Tab — Damaged (`/damaged-goods`)

File [pages/DamagedGoods.js](erp-frontend/src/pages/DamagedGoods.js).

- Title `"Damaged goods"`, subtitle `"Track stock removed from sellable inventory — damaged, in repair, written off, or restored."`. Button `"+ Report damage"`.
- 4-up stats: `"Damaged"`, `"In repair"`, `"Write-off"`, `"Repaired (returned to stock)"`.
- Form `"Report damaged stock"`: `"Item *"` (`"— Select —"`), `"Store"` (`"— Any —"`), `"Quantity *"` (min 1), `"Status *"` (`"— Select —"`; values `DAMAGED` / `IN_REPAIR` / `WRITE_OFF` / `REPAIRED`), `"Reported on *"`, `"Reason"`, `"Notes"`.
- Buttons `"Save"`, `"Cancel"`. Validation `"Save failed"`.
- Columns: `"Voucher"` · `"Reported on"` · `"Item"` · `"Store"` · `"Qty"` · `"Status"` · `"Reason"` · `"Actions"`. Status chips: `"Damaged"` (danger), `"In repair"` (warn), `"Write-off"` (danger), `"Repaired (returned to stock)"` (success). Row actions: change status dropdown, Delete. Empty: `"No damaged goods recorded yet."`.

---

### 5.10 Employee hub — `/employees`

Hub title `"Employees"` · subtitle `"Staff roster, attendance, payments, incentive rules, and ledger."`. Tabs: **Info · Attendance · Payments · Incentive Rules · Ledger**.

#### Tab — Info (`/employees`)

Panel in MasterData.js.

- Heading `"Employees"`.
- Buttons: `"Run salary accrual"` (title `"Post any due monthly-salary accruals now (idempotent)"`), `"+ Add Employee"`.
- Search label `"Quick search"`, placeholder `"Type code, name, role, phone, or email…"`.

Form `"New Employee"` / `"Edit Employee"`:

| Field | Label / placeholder |
|---|---|
| Code | `"Code"` — `"Auto-generated if blank"` |
| Name | `"Name *"` |
| Role | `"Role"` — `"e.g. Cashier, Salesman"` |
| Phone | `"Phone"` |
| Email | `"Email"` |
| Monthly salary | `"Monthly salary"` |
| Opening balance | `"Opening balance"` |
| Joined on | `"Joined on"` (date) |
| Salary day | `"Salary day of month"` — placeholder `"1-31, blank = no auto-accrual"`, hint `"On this day each month, the salary is auto-credited to the employee's ledger as money we owe them."` |
| Accrue joining month | `"Accrue salary for the joining month too (first salary in advance)"` (checkbox) |
| Address | `"Address"` (textarea) |
| Notes | `"Notes"` (textarea) |
| Active | `"Active"` (checkbox, default on) |

Buttons `"Create"`/`"Update"`, `"Cancel"`. Delete confirm `"Delete {name}?"`, toggle confirm `"Close|Reopen {name}?"`.

Table columns: `"Code"` · `"Name"` · `"Role"` · `"Phone"` · `"Salary"` · `"Balance"` · `"Status"` · `"Actions"`. Status chips `"Active"` (success), `"CLOSED"`; balance trailer `"· we owe"`, `"· they owe"`, `"· settled"` (warn / info). Row actions `"Ledger"`, `"Edit"`, `"Close"`/`"Reopen"`, `"Delete"`. Empty: `"No employees yet."` / `"No matches."`.

#### Tab — Attendance (`/attendance`)

File [pages/Attendance.js](erp-frontend/src/pages/Attendance.js).

- Title `"Attendance · {date}"`, subtitle `"Mark daily presence for each active employee."`. Date input + `"Refresh"`.
- Tally chips: `"✓ Present"` (success), `"½ Half day"` (warn), `"○ Leave"` (info), `"✕ Absent"` (danger).
- Table: `"Employee"` · `"Role"` · `"Current status"` · `"Mark"`. Status text in cell: same four labels or `"— not marked —"`. Mark column has four buttons matching the chip labels.
- Empty: `"No active employees yet. Add employees first under Catalogue → Employees."`

#### Tab — Payments (`/employee-payments`)

File [pages/EmployeePayments.js](erp-frontend/src/pages/EmployeePayments.js).

- Title `"Employee payments"`, subtitle `"Salary, advances, reimbursements, expenses, incentive payouts."`. Export file `employee_payments`. Button `"+ New entry"`.
- Form `"New employee transaction"`:
  - `"Employee *"` (`"— Select —"`)
  - `"Type *"` — `"Salary"`, `"Advance (employee borrows)"`, `"Reimbursement (employee paid expense)"`, `"Shop expense paid by employee"`, `"Incentive payout"`, `"Adjustment"`
  - `"Date *"`, `"Amount *"` (min 0.01)
  - `"Account (for cash/bank flow)"` — `"— None / out-of-pocket —"`
  - `"Description"` — placeholder `"e.g. April salary, advance against May pay, tea + transport reimbursement"`
  - `"Notes"` textarea
- Buttons `"Save"`, `"Cancel"`. Validation `"Save failed"`.
- Columns: `"Date"` · `"Voucher"` · `"Employee"` · `"Type"` · `"Description"` · `"Account"` · `"Amount"` · `"Actions"` (Delete). Empty: `"No transactions yet."`.

#### Tab — Incentive Rules (`/employee-incentive-rules`)

File [pages/EmployeeIncentiveRules.js](erp-frontend/src/pages/EmployeeIncentiveRules.js).

- Title `"Employee incentive rules"`, subtitle `"Percentage of qualifying sales credited to the employee's ledger. Multiple rules can apply to the same sale — they stack."`. Button `"+ New rule"`.
- Form `"New rule"` / `"Edit rule"`:
  - `"Employee *"` (`"— Select —"`)
  - `"Applies to *"` — options `"All sales"`, `"Sales of a category"`, `"Sales of a specific item"`, `"Sales of a brand"`.
  - Conditional `"Category *"` / `"Item *"` / `"Brand *"` (`"— Select —"`).
  - `"Percentage of sale *"` (placeholder `"e.g. 2"`, max 100).
  - `"Starts on"`, `"Ends on"`.
  - `"Notes"` (placeholder `"e.g. Salesman bonus on inverter ACs"`).
  - `"Active"` (checkbox).
- Buttons `"Create"`/`"Update"`, `"Cancel"`. Confirm delete: `"Delete this rule?"`. Validation `"Save failed"`.
- Columns `"Employee"` · `"Applies to"` · `"Reference"` · `"Percentage"` · `"Period"` · `"Status"` · `"Actions"`. Period cell shows `"{startsOn} → {endsOn}"` (mono) or `"always"` (muted). Status chips `"Active"` (success) / `"Inactive"`. Row actions `"Edit"`, `"Delete"`. Empty: `"No rules yet."`.

#### Tab — Ledger (`/employee-ledger`)

File [pages/EmployeeLedger.js](erp-frontend/src/pages/EmployeeLedger.js).

- Title `"Employee ledger"`, subtitle `"Salary, advances, expenses, and incentives earned with running balance."`.
- Picker `"— Select employee —"` (option fmt `"{name} · {role}"`). `"From"`, `"To"` dates.
- Summary stripe: `"Opening balance"`, `"Incentives earned · this period"`, `"Current balance · {status}"` (statuses `"we owe employee"` / `"employee owes us"` / `"settled"`). Amounts as `"Rs {value}"`.
- Table: `"Date"` · `"Ref"` · `"Type"` · `"Description"` · `"Earned"` · `"Paid"` · `"Balance"`.
- Empty: `"Select an employee to view their ledger."` and `"No transactions in this period. Add salary, advances, expenses, or incentive rules to populate the ledger."`.

---

### 5.11 Account hub — `/accounts`

Hub title `"Accounts"` · subtitle `"Cash, bank, wallet, capital, and credit accounts plus transfers."`. Tabs: **Info · Transfers · Ledger**.

#### Tab — Info (`/accounts`)

Panel in MasterData.js. Title `"Accounts (Cash / Bank / Wallet / Capital / Credit)"`.

Form fields:

- `"Code"` (placeholder `"Auto-generated if blank (e.g. ACC-000001)"`)
- `"Name *"`
- `"Type *"` — options:
  - `"Cash (physical till)"`
  - `"Bank account"`
  - `"Mobile wallet (Easypaisa, JazzCash…)"`
  - `"Owner Capital / Equity"`
  - `"Credit card / Credit line"`
- `"Bank Name"`, `"Account #"`
- `"Opening Balance"`
- `"Active"` (default on)

Columns: `"Code"`, `"Name"`, `"Phone"`, `"Email"`, `"Opening"`, `"Balance"`, `"Status"`, `"Actions"`. Row actions `"Ledger"`, `"Edit"`, `"Close"`/`"Reopen"`, `"Delete"`. Empty: `"No records yet."`.

#### Tab — Transfers (`/fund-transfers`)

File [pages/FundTransfers.js](erp-frontend/src/pages/FundTransfers.js).

- Heading `"Fund Transfers"`, button `"+ New Transfer"`.
- Info text: `"Move money between your own accounts (Capital → Cash, Cash → Bank, Bank → Credit Card, etc.). Customer/supplier payments belong on the Receipts / Payments pages."`
- Form `"New Transfer"`: `"Date *"`, `"From Account *"` (`"— Select —"`), `"To Account *"` (`"— Select —"`), `"Amount *"` (min 0.01), `"Notes"` (placeholder `"e.g. Capital injection for register opening"`).
- Buttons `"Save Transfer"`, `"Cancel"`. Validation: `"Source and destination must differ"`, `"Save failed"`.
- Columns: `"Transfer #"`, `"Date"`, `"From"`, `"To"`, `"Amount"`, `"Notes"`, `"Actions"` (Delete). Empty: `"No transfers yet."`.

#### Tab — Ledger (`/account-ledger`)

File [pages/AccountLedger.js](erp-frontend/src/pages/AccountLedger.js). Picker `"— Select account —"` grouped by type (CASH / BANK / WALLET / CAPITAL / CREDIT), option format `"{name} ({balance})"`. Card shows name + `{type}` badge + bank name and account number lines when present. Empty: `"Select an account to view its ledger. All Bank, Wallet, Cash, Capital and Credit accounts are listed."`.

---

### 5.12 Users hub — `/users` (admin) / `/users-change-password` (everyone)

Hub title `"Users"` · subtitle `"User accounts, access requests, sign-in history, and passwords."`. Tabs:

| Tab | Route | Role |
|---|---|---|
| `"Info"` | `/users` | superuser only |
| `"Allow Access"` | `/users-allow-access` | superuser only |
| `"Recent Login"` | `/users-recent-login` | superuser only |
| `"Change Password"` | `/users-change-password` | everyone |

#### Tab — Info (superuser)

File [pages/users/UsersInfo.js](erp-frontend/src/pages/users/UsersInfo.js).

- Heading `"Users"`, button `"+ Add user"`.

**Create user modal** — title `"Create user"`. Fields:

- `"Username *"` (autoFocus, minLength 2)
- `"Password *"` (type password, minLength 6)
- `"Full name"`
- `"Role"` — `"USER (regular)"` / `"SUPERUSER (admin)"`

Buttons `"Create user"` (busy → `"Saving…"`), `"Cancel"`.

Table columns: `"Username"`, `"Full name"`, `"Role"`, `"Status"`, `"Last login"`, `"Created"`, `"Actions"`. Role badges: `"SUPERUSER"` (green) / `"USER"` (gray). Status badges: `"Active"` (green) / `"Disabled"` (red). Current-user trailer: `"(you)"` (muted). Row actions: `"Disable"` / `"Enable"`, `"Delete"` (both disabled for the current user).

#### Tab — Allow Access (superuser)

File [pages/users/UsersAllowAccess.js](erp-frontend/src/pages/users/UsersAllowAccess.js).

- Heading `"Access requests"`. Status filter: `"Status:"` + options `"Pending"`, `"Approved"`, `"Rejected"`.

**Approve modal** — title `"Approve {fullName}'s access request"`. Body `"Assign a username + password. The new user will be created as a regular USER; you can promote them later from the Info tab."`. Fields `"Username *"`, `"Initial password *"`, `"Full name"`. Buttons `"Approve & create user"` (busy → `"Approving…"`), `"Cancel"`.

Table columns: `"Submitted"`, `"Requested username"`, `"Full name"`, `"Contact"`, `"Reason"`, `"Status"`, `"Actions"`. Status badges: `"PENDING"` (gray), `"APPROVED"` (green), `"REJECTED"` (red). Contact cell shows phone/email or `"—"`. Row actions: `"Approve"`, `"Reject"` (PENDING); `"Delete"` (otherwise). Empty: `"No {status} requests."`.

#### Tab — Recent Login (superuser)

File [pages/users/UsersRecentLogin.js](erp-frontend/src/pages/users/UsersRecentLogin.js). Heading `"Recent logins"`, button `"Refresh"`. Columns `"When"`, `"Username"`, `"IP"`, `"User agent"`. Unseen rows get a `"new"` badge (green). Empty: `"No logins recorded yet."`.

#### Tab — Change Password (everyone)

File [pages/users/UsersChangePassword.js](erp-frontend/src/pages/users/UsersChangePassword.js).

**My password card** — title `"My password — {username}"`. Fields: `"Current password"`, `"New password"` (minLength 6), `"Confirm new password"`. Errors: `"New password must be at least 6 characters."`, `"New password and confirmation do not match."`, `"Could not change password"`. Success: `"Password changed. Please sign in again with the new password."`. Button `"Save new password"` (busy → `"Saving…"`).

**Admin reset card (superuser only)** — title `"Reset another user's password"`. Body `"As an administrator you can set a new password for any other user. They'll be signed out everywhere and will need to use the new password on their next login."`. Fields `"User *"` (default `"— pick a user —"`, format `"{username} ({fullName}) · admin|disabled"`), `"New password *"`, `"Confirm new password *"`. Errors: `"Pick a user."`, `"New password must be at least 6 characters."`, `"New password and confirmation do not match."`, `"Could not reset password"`. Success: `"Password updated for "{username}". They'll be forced to sign in again."`. Button `"Reset password"` (busy → `"Saving…"`).

---

### 5.13 Reports — `/financials`

File [pages/Financials.js](erp-frontend/src/pages/Financials.js).

- Title `"Financial statements"`.
- Subtitle: Balance Sheet → `"As of {asOf} · incentives applied to adjusted net income"`. Other statements → `"{from} → {to} · incentives applied to adjusted net income"`.
- Date inputs (unlabeled `<input type="date">`) + button `"Apply"` (busy → `"Loading…"`).
- `<ExportButtons>` (`"CSV"` / `"PDF"` — see §6.1).
- Tab strip:

| Tab | Key | What |
|---|---|---|
| `"Income Statement"` | `income` | Revenue / COGS / Operating expenses / Incentives → Adjusted net income |
| `"Balance Sheet"` | `balance` | Assets / Liabilities / Equity |
| `"Cash Flow"` | `cash` | Operating activities → Net operating cash → Ending cash |
| `"Changes in Equity"` | `equity` | Equity rollforward + reconciliation |

Each tab renders a `.card.stmt` containing rows:

- `.stmt-row.group` — section heading (bold)
- `.stmt-row.sub` — indented line item
- `.stmt-row.sum` — subtotal (bold)
- `.stmt-row.final` — grand total

**Income Statement rows:**

- Group `"Revenue"`: `"Gross sales"`, `"Less: discounts"`, `"Less: sales returns"`, sum `"Net revenue"`.
- Group `"Cost of goods sold"`: `"COGS at cost"`, `"Returns at cost"`, sum `"Gross profit"`.
- Group `"Operating expenses"`: `"Employee incentives (per sale × rule)"`, `"Other expenses"`, sum `"Net income (trading)"`.
- Group `"Incentives"`: `"Awards received in period"`, final `"Adjusted net income"`.

**Balance Sheet rows:**

- Group `"Assets"`: `"Cash on hand"`, `"Bank balances"`, `"Wallet"`, `"Inventory at cost"`, `"Accounts receivable"`.
- Group `"Liabilities"`: `"Accounts payable"`, `"Credit payable"`.
- Group `"Equity"`: `"Owner capital contributed"`, `"Retained earnings"`.

**Cash Flow rows:**

- Group `"Operating activities"`: `"Cash receipts from customers"`, `"Cash sales"`, `"Cash paid to suppliers"`, `"Cash paid for purchases"`, sum `"Net operating cash"`.
- Group `"Summary"`: `"Beginning cash"`, `"Net change in cash"`, final `"Ending cash"`.

**Changes in Equity rows:**

- `"Opening equity"`, `"(+) Net income for period"`, conditional `"(+) Incentive awards"`, `"(−) Drawings"`, final `"Closing equity"`.
- Group `"Reconciliation"`: `"Expected (Opening + Net Income)"`, `"Actual closing"`, `"Difference"`.

CSV/PDF exports use a flattened `{label, value}` list with slightly different labels (see Financials.js lines 178–248 for the literal export labels — e.g. CSV writes `"Gross Revenue"` where the on-screen UI shows `"Gross sales"`).

---

### 5.14 System hub — `/backup` (default)

Hub title `"System"` · subtitle `"Backups, audit trail, accent colour, and runtime error log."`. Tabs: **Backups · Audit · Errors · Accent** (Audit + Errors are superuser-only).

#### Tab — Backups (`/backup`)

File [pages/Backup.js](erp-frontend/src/pages/Backup.js).

- Heading `"Backups"`. Buttons:
  - `"⬇ Download snapshot"` (title `"Generate a snapshot and download without saving on the server"`)
  - `"💾 Save backup now"`
- Overdue warning (when applicable): `"⚠ Today's backup hasn't been taken yet. The scheduled time was {HH}:00. Click "Save backup now" to take one."`.

**Status card** — title `"Status"`. Rows: `"Last backup"` (`"{datetime}"` or `"Never"`); `"Today's backup"` (badge `"Done"` green or `"Pending"` red); `"Saved on"` (`"{backupDir}"` muted mono path).

**Schedule card** — title `"Schedule"`. Body `"The system automatically takes one backup per day at the time you set below. If the shop is closed at that hour, opening the app later in the day will surface a reminder banner."`. Field `"Daily backup hour (0–23)"` (number, default 20; hint `"e.g. 20 = 8 PM (end of day for most retail shops)"`). Button `"Save schedule"` (busy → `"Saving…"`).

**Restore card** — title `"🔥 Restore from backup"` (red bordered, `--danger-fg` title). Warning alert:

> **Destructive:** restoring wipes every business table (sales, purchases, payments, items, customers, …) and replays the chosen snapshot. Before the wipe runs we automatically save a **Pre-restore safety snapshot** of your current DB as an AUTO backup, so you can roll back if needed. The Backups history itself is kept across restores.

Fields:

- `"Backup file (.json)"` (file picker)
- Snapshot hint when loaded: `"Loaded: {fileName} · generated {date} · {tables} tables"`
- `"Type RESTORE to confirm"` (placeholder `"RESTORE"`)
- `"Your account password"` (placeholder `"••••••••"`)

Button `"Restore now"` (busy → `"Restoring…"`). Success: `"✓ Restored {rows} rows across {tables} tables at {date}. Your previous state was saved as {fileName} — use it from the History list below if you need to roll back."`.

**History section** — title `"History"`. Columns `"Created"`, `"File"`, `"Source"`, `"Size"`, `"Notes"`, `"Actions"`. Source badges: `"AUTO"` (gray), `"MANUAL"` (green). Row actions `"Download"`, `"Delete"` (confirm: `"Delete backup {fileName}? This removes the file from disk."`). Empty: `"No backups taken yet. Click "Save backup now" to create the first one."`.

#### Tab — Audit (`/audit-log`, superuser)

File [pages/AuditLog.js](erp-frontend/src/pages/AuditLog.js).

- Heading `"Audit log"`. Buttons: `"Refresh"`, `<ExportButtons>` (file `audit_log`).
- Filter row: `"Entity type"` (`"All"` + dynamic), `"Action"` (`"All"`, `"CREATE"`, `"UPDATE"`, `"DELETE"`), `"From"`, `"To"`, `"Limit"` (default 500, range 50–5000 step 50), `"Quick search"` (placeholder `"Search summary, ID, action…"`).
- Table: `"When"`, `"Action"`, `"Entity"`, `"Summary"`, `"Source"`, `"Changes"`. Action badges: CREATE (green), UPDATE (blue), DELETE (red). Changes cell: `"view"` reveals JSON.
- Empty: `"No audit entries yet."` / `"No rows match the filter."`.

#### Tab — Errors (`/error-log`, superuser)

File [pages/ErrorLog.js](erp-frontend/src/pages/ErrorLog.js).

- Heading `"Errors & exceptions"`. Buttons: `"Refresh"`, `"Clear all"` (confirm `"Wipe the error log? This cannot be undone."`), `<ExportButtons>` (file `error_log`).
- Filter row: `"Level"` (`"All"`, `"ERROR"`, `"WARN"`), `"Source"` (`"All"` + dynamic), `"From"`, `"To"`, `"Limit"` (default 500), `"Quick search"` (placeholder `"Search message, path, status…"`).
- Table: `"When"`, `"Level"`, `"Status"`, `"Method"`, `"Path"`, `"Message"`, `"Source"`, `"Detail"`. Level badges: `"ERROR"` (red), `"WARN"` (yellow). Detail cell `"view"` reveals stack (≤ 240 px) + context JSON.
- Empty: `"No errors logged. Nice."` / `"No rows match the filter."`.

#### Tab — Accent (`/accent`)

File [pages/Accent.js](erp-frontend/src/pages/Accent.js).

- Heading `"Accent colour"`.
- Body: `"The accent colour is used for primary buttons, active tabs, focus rings, the Adjusted Net Income row on the Income Statement, and the active sidebar strip. Saved on this device only."`

**Accent Source radiogroup (two cards):**

1. Card `"Follow Windows accent"`
   - With OS accent: `"Auto-syncs with Windows Personalisation. Currently {hex}."`
   - Without: `"Available only inside the desktop app on Windows or macOS."` (card disabled)
2. Card `"Use custom accent"`
   - `"Pick a preset or type any hex value below."` (always enabled)

**When custom is selected:**

- Label `"Presets"` — a grid of 36×36 colored swatch buttons. Each swatch button has `aria-label="{name}"` and `title="{name} — {value}"`. Selected swatch gets a 2 px border in `var(--text)`.
- Field `"Custom colour"` (`<input type="color">`).
- Field `"Hex value"` (text, placeholder `"#0078d4"`, regex `/^#[0-9a-fA-F]{6}$/`).

**Success flash messages (auto-dismiss 2.5 s):**

- `"Now following the Windows accent colour."`
- `"Switched to a custom accent. Pick any colour below."`
- `"Accent colour updated."`

**Footer info (muted, bordered top):**

- `"**Current source:** Custom ({hex}) | Windows accent ({hex}) | Default ({hex})"`
- Conditional `"When you change your Windows Personalisation colour the app picks it up automatically."`
- Conditional `"Open this app through the Electron desktop wrapper on Windows or macOS to enable "Follow Windows accent"."`

---

## 6. Cross-cutting components

### 6.1 ExportButtons

File [components/ExportButtons.js](erp-frontend/src/components/ExportButtons.js).

| Button | Text | Title |
|---|---|---|
| CSV | `"CSV"` | `"Download as CSV (opens in Excel / Google Sheets)"` |
| PDF | `"PDF"` | `"Open print view — choose 'Save as PDF' as the destination"` |

Both disabled when `disabled || empty`. CSV is built client-side as UTF-8 BOM. PDF opens a print-friendly tab with the Hassan letterhead + timestamp and triggers `window.print()` so the user picks "Save as PDF".

### 6.2 CrudPage scaffold

File [components/CrudPage.js](erp-frontend/src/components/CrudPage.js). Generic master-data scaffold used by Brands, Stores, Accounts, etc.

- Required fields rendered with ` *` suffix.
- Default select placeholders `"— Select —"` and `"— None —"`.
- Standard error text `"Save failed"`, `"Delete failed"`.
- Standard delete confirm `Delete "{row.name ?? row.id}"?`.
- Loading state `"Loading…"`. Empty states `"No records yet."` / `"No matches."`.

### 6.3 VoucherPage (shared by Receipts + Payments)

File [components/VoucherPage.js](erp-frontend/src/components/VoucherPage.js). Direction-driven text:

| Element | IN (Receipt) | OUT (Payment) |
|---|---|---|
| Page title | `"Receipts"` | `"Payments"` |
| New button | `"+ New Receipt"` | `"+ New Payment"` |
| Form title | `"New Receipt Voucher"` | `"New Payment Voucher"` |
| Party label | `"Customer *"` | `"Supplier *"` |
| Balance hint | `"Outstanding A/R: …"` / `"Customer credit: …"` / `"Settled."` | `"Outstanding A/P: …"` / `"Supplier owes us: …"` / `"Settled."` |
| Party column | `"Customer"` | `"Supplier"` |

All other strings constant: `"Account *"`, `"Amount *"`, `"Notes"`, `"Save Voucher"`, `"Cancel"`, columns `"Voucher #"` / `"Date"` / … / `"Amount"` / `"Notes"`, `"No vouchers yet."`, `"Loading…"`.

### 6.4 Alerts

| Class | Text source |
|---|---|
| `.alert.alert-error` | `err.uiMessage` from API or fallback (`"Save failed"`, `"Sign-in failed"`, `"Could not change password"`, …) |
| `.alert.alert-success` | confirmation message (e.g. `"Now following the Windows accent colour."`) |

Visual: 8 px padding, 13 px font, 1 px transparent border with a 3 px left strip (`--danger` or `--success`).

### 6.5 Modal shell

```html
<div class="modal-backdrop" onClick={onCancel}>
  <div class="modal" onClick={(e) => e.stopPropagation()}>
    <h3>…</h3>
    <p>…</p>
    <div class="modal-footer">
      <button class="btn">Cancel</button>
      <button class="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

Backdrop: `rgba(0,0,0,0.45)` light / `rgba(0,0,0,0.6)` dark, z-index 100. Modal: width `min(520px, 92vw)`, `--surface` background, 1 px `--border-strong` border, 20 px padding, `--shadow-lg`. No border-radius.

### 6.6 Window.confirm uses

| Caller | Text |
|---|---|
| CrudPage | `Delete "{name ?? id}"?` |
| Categories | `Delete "{name}"? Sub-categories will be re-parented to root.` |
| Backup history | `Delete backup {fileName}? This removes the file from disk.` |
| Error log | `Wipe the error log? This cannot be undone.` |
| PO status | `Mark PO {poNo} as {status}?` / `Delete PO {poNo}? This can't be undone.` |
| Employee | `Delete {name}?` / `Close|Reopen {name}?` |
| Incentive rule | `Delete this rule?` |
| Cash entry | `Delete this cash book entry?` |

### 6.7 GlobalSearch

Already documented in §3.2. Result kinds: `"Customer"`, `"Supplier"`, `"Employee"`, `"Account"`, `"Item"`. Placeholder `"Search by code, name, phone, SKU…"`. Empty popover: `"Loading…"`, `"No matches."`.

---

## 7. Electron shell

The renderer runs inside an Electron 40 wrapper. Notable native chrome:

- **Custom `app://` protocol** — renderer loaded as `app://localhost/index.html`. Loading via `file://` is forbidden (memory: `feedback_…`, CLAUDE.md "Don'ts").
- **Title-bar overlay** — `titleBarStyle: 'hidden'` + `titleBarOverlay` paints the Windows min/max/close controls on the right at 44 px tall. The in-app `.topbar` is the drag region.
- **Native menu killed** — `Menu.setApplicationMenu(null)`. No File/Edit/View bar.
- **Splash window during backend boot** — frameless 420×220 dialog with `"Hassan Electronics ERP"` heading, dynamic message (`"Starting backend…"` then `"Loading interface…"`), indeterminate progress bar, footer `"First launch may take up to a minute."`.
- **Backend ready timeout** — 300 s (5 min) before the splash gives up with `"Backend did not become ready within 300 s. Diagnostic log: {path}"`.
- **Backend crash** — `"Backend stopped — The local ERP backend exited unexpectedly (code N). Diagnostic log: …"`.
- **Build-missing dialogs** — `"Backend build missing"` / `"Frontend build missing"` if the packaged resources are absent.

The Electron entry [erp-desktop/src/main.js](erp-desktop/src/main.js) is the source of truth for all of the above.

---

## 8. File-to-page map

| Page | File |
|---|---|
| App shell | [components/Layout.js](erp-frontend/src/components/Layout.js) |
| HubFrame | [components/HubFrame.js](erp-frontend/src/components/HubFrame.js) |
| Brand | [components/Brand.js](erp-frontend/src/components/Brand.js) |
| Logo | [components/Logo.js](erp-frontend/src/components/Logo.js) |
| Icons | [components/Icon.js](erp-frontend/src/components/Icon.js) |
| ThemeToggle | [components/ThemeToggle.js](erp-frontend/src/components/ThemeToggle.js) |
| SyncButton | [components/SyncButton.js](erp-frontend/src/components/SyncButton.js) |
| GlobalSearch | [components/GlobalSearch.js](erp-frontend/src/components/GlobalSearch.js) |
| ExportButtons | [components/ExportButtons.js](erp-frontend/src/components/ExportButtons.js) |
| CrudPage | [components/CrudPage.js](erp-frontend/src/components/CrudPage.js) |
| VoucherPage (Receipts + Payments) | [components/VoucherPage.js](erp-frontend/src/components/VoucherPage.js) |
| Items panel | [components/master/ItemsPanel.js](erp-frontend/src/components/master/ItemsPanel.js) |
| Categories panel | [components/master/CategoriesPanel.js](erp-frontend/src/components/master/CategoriesPanel.js) |
| Login | [pages/Login.js](erp-frontend/src/pages/Login.js) |
| Dashboard | [pages/Dashboard.js](erp-frontend/src/pages/Dashboard.js) |
| POS Terminal | [pages/POS.js](erp-frontend/src/pages/POS.js) |
| Cash Book | [pages/CashRegister.js](erp-frontend/src/pages/CashRegister.js) |
| Master Data (Customer / Supplier / Brands / Stores / Accounts / Employees panels) | [pages/MasterData.js](erp-frontend/src/pages/MasterData.js) |
| Sales History | [pages/Sales.js](erp-frontend/src/pages/Sales.js) |
| Sale Returns | [pages/SaleReturns.js](erp-frontend/src/pages/SaleReturns.js) |
| Purchase Orders | [pages/PurchaseOrders.js](erp-frontend/src/pages/PurchaseOrders.js) |
| Purchases | [pages/Purchases.js](erp-frontend/src/pages/Purchases.js) |
| Purchase Returns | [pages/PurchaseReturns.js](erp-frontend/src/pages/PurchaseReturns.js) |
| Incentives | [pages/Incentives.js](erp-frontend/src/pages/Incentives.js) |
| Customer / Supplier Ledger | [pages/CustomerLedger.js](erp-frontend/src/pages/CustomerLedger.js), [pages/SupplierLedger.js](erp-frontend/src/pages/SupplierLedger.js) |
| Stock | [pages/Stock.js](erp-frontend/src/pages/Stock.js) |
| Stock Ledger | [pages/StockLedger.js](erp-frontend/src/pages/StockLedger.js) |
| Stock Transfers | [pages/StockTransfers.js](erp-frontend/src/pages/StockTransfers.js) |
| Damaged Goods | [pages/DamagedGoods.js](erp-frontend/src/pages/DamagedGoods.js) |
| Attendance | [pages/Attendance.js](erp-frontend/src/pages/Attendance.js) |
| Employee Payments | [pages/EmployeePayments.js](erp-frontend/src/pages/EmployeePayments.js) |
| Employee Incentive Rules | [pages/EmployeeIncentiveRules.js](erp-frontend/src/pages/EmployeeIncentiveRules.js) |
| Employee Ledger | [pages/EmployeeLedger.js](erp-frontend/src/pages/EmployeeLedger.js) |
| Fund Transfers | [pages/FundTransfers.js](erp-frontend/src/pages/FundTransfers.js) |
| Account Ledger | [pages/AccountLedger.js](erp-frontend/src/pages/AccountLedger.js) |
| Users — Info / Allow Access / Recent Login / Change Password | [pages/users/](erp-frontend/src/pages/users/) |
| Financials | [pages/Financials.js](erp-frontend/src/pages/Financials.js) |
| Backups | [pages/Backup.js](erp-frontend/src/pages/Backup.js) |
| Audit log | [pages/AuditLog.js](erp-frontend/src/pages/AuditLog.js) |
| Error log | [pages/ErrorLog.js](erp-frontend/src/pages/ErrorLog.js) |
| Accent | [pages/Accent.js](erp-frontend/src/pages/Accent.js) |
| Tokens / Theme | [styles/tokens.css](erp-frontend/src/styles/tokens.css), [theme/ThemeContext.js](erp-frontend/src/theme/ThemeContext.js) |
| Hubs / Sidebar | [nav/hubs.js](erp-frontend/src/nav/hubs.js) |
| Electron shell | [erp-desktop/src/main.js](erp-desktop/src/main.js) |
