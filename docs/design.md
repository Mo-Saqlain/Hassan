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
| Aurora layer | Disabled: `body::before { display: none !important; }`. `--bg-aurora-1..4` all `transparent`. `--aurora-strength: 0`, `--glass-strength: 1`. |
| Gradients | None on chrome. `--gradient-primary`, `--gradient-accent`, `--gradient-warm` resolve to solid colors (no-op placeholders). `.btn-primary::after` / `.card::before` are suppressed (`content: none`). |
| Shadows | `--shadow-sm`, `--shadow`, `--gloss-top` are `none`. Only `--shadow-lg` is set (modals + login card): `0 2px 6px rgba(0,0,0,.18)` light / `0 4px 8px rgba(0,0,0,.55)` dark. |
| Motion | `--ease: linear`; durations `--dur-fast 60ms`, `--dur 100ms`, `--dur-slow 140ms`. Only `color` / `background` / `border` transitions; no transforms, no spinners except the Sync icon. |
| Font (UI) | `Segoe UI Variable Text` → `Segoe UI` → system stack (`--font-body`). Display variant for headings (`--font-display` = `Segoe UI Variable Display` → …). |
| Font (numbers) | `Cascadia Code` → `Cascadia Mono` → `Consolas` → `ui-monospace` (`--font-mono`). Used on SKUs, prices, refs, voucher numbers, dates in tables. `font-feature-settings: "tnum","zero"`. |
| Heading sizes | `h1` 22 px · `h2` 18 px · `h3` 15 px. Body 14 px. Labels 11–13 px. |
| Spacing | Grid/flex gaps 6–14 px. Card padding 8–28 px. |

> **Two stylesheets, layered.** [App.css](erp-frontend/src/App.css) loads first (legacy + domain rules: badges, modals, print, login, reports, tile colors, sidebar legacy tokens, the `-soft`/`-fg` semantic variants), then [tokens.css](erp-frontend/src/styles/tokens.css) overrides shared token names with the Win10 palette, then [app.css](erp-frontend/src/styles/app.css) provides the flat shell layout (sidebar/topbar/hub/grids/POS/charts/responsive). For any token defined in both files **tokens.css wins** (loaded later); App.css remains the sole source for `--success-soft`/`-fg`, `--danger-soft`/`-fg`, tile colors, and all print styles. [index.css](erp-frontend/src/index.css) only sets a legacy `code` mono stack.

### Sidebar color tokens

Each sidebar entry carries its own hue used only for the 24×24 icon chip (tinted background `color-mix(in srgb, var(--nav-c) 16%, transparent)` + matching 22% border) and the 3 px left strip on the active row. The tokens in [tokens.css](erp-frontend/src/styles/tokens.css):

| Token | Hue | Used by |
|---|---|---|
| `--nav-dashboard` | `#0078d4` Windows blue | Dashboard |
| `--nav-pos` | `#c50f1f` brick red | POS Terminal (route only — no sidebar entry; see §3.1) |
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

The brand-spectrum chart tokens (`--violet-500/400`, `--indigo-500`, `--cyan-500/400`, `--pink-500/400`) feed the inline-SVG charts (Dashboard revenue line, donuts, stacked bars). They are the only place "gradients" survive — and only inside chart strokes/fills, never on chrome.

### Semantic tokens

| Token | Hue | Meaning |
|---|---|---|
| `--success` | `#107c10` | Active / paid / found / received / approved |
| `--warning` | `#ca5010` | Partial / variance / pending / in-repair |
| `--danger`  | `#c50f1f` | Closed / failed / overdue / damaged / rejected |
| `--info`    | `#0078d4` | Informational chips; also the active-tab underline |
| `--primary` | `#0078d4` Windows blue | Buttons, focus rings, active sidebar strip. **Hard-coded** — there is no user-facing accent setting and no OS-accent bridge (the dev removed the accent settings page). |

Chip variants: `.chip-success`, `.chip-warn`, `.chip-danger`, `.chip-info`, `.chip-violet` — all render white text on the semantic background (white preserved in dark theme too).

### Theme

Light + dark, persisted as `data-theme="light"|"dark"` on `<html>`. Storage key `hassan-theme` ([ThemeContext.js](erp-frontend/src/theme/ThemeContext.js)). The bootstrap IIFE [public/theme-bootstrap.js](erp-frontend/public/theme-bootstrap.js) (loaded synchronously in `<head>` before the React bundle) reads the saved theme — falling back to `prefers-color-scheme` — and sets `data-theme` so there is **no flash**. It is a separate file specifically so the page CSP can stay `script-src 'self'` (no `'unsafe-inline'`). On Electron, a theme change additionally IPCs the title-bar overlay color via `window.erpBridge.setTitleBarTheme(theme)` so the Windows-drawn min/max/close area flips with the renderer.

`color-scheme: light|dark` is set per theme. Key surface tokens: light `--bg #f3f3f3`, `--surface #fff`, `--surface-elev #fafafa`, `--border #d1d1d1`, `--text #1f1f1f`; dark `--bg #1f1f1f`, `--surface #2c2c2c`, `--surface-elev #333`, `--border #404040`, `--text #f5f5f5`. The dark surface-elev (`#333`) must match the Electron title-bar overlay color or a seam shows.

---

## 2. Icon catalogue

Single source: [erp-frontend/src/components/Icon.js](erp-frontend/src/components/Icon.js). All icons are stroke-based SVG (`viewBox 0 0 24 24`, `fill: none`, `stroke: currentColor`, 1.75 px stroke, round caps/joins, `aria-hidden`). Used as `<Icon name="…" size={…}/>`. Unknown names render `null`.

| Group | Names |
|---|---|
| **Navigation** | `dashboard` (4-up grid) · `pos` (rectangle on stand) · `menu` (three lines) · `master` (connected circles) · `tx` (dual arrows) · `search` (magnifier) |
| **Domain** | `user` · `users` · `package` / `box` (open box) · `packageX` (damaged box w/ X) · `card` (credit card) · `receipt` (folded receipt) · `transfer` / `swap` (dual arrows) · `bank` (column building) · `stock` / `boxes` (cube) · `cash` (till + coin) · `store` (storefront) · `warehouse` (loading bay) · `truck` · `ledger` / `book` · `backup` (stacked discs) · `reports` (line chart) · `chartBar` · `shield` (with check) · `incentive` (star) · `trophy` · `filter` (funnel) · `download` · `rotate` (curved arrow — used for Sync, spins when busy) · `folderTree` · `tag` · `credit` (circle w/ in/out arrows) |
| **Brand / theme** | `sun` · `moon` · `bolt` (lightning) · `sparkles` (two stars) · `logo` (HE monogram path, white fills, `stroke: none`) |
| **Chrome** | `chevron` · `chevronLeft` · `chevronRight` · `x` · `plus` · `minus` · `trash` · `arrow-up` · `arrow-down` · `arrow-right` · `arrowUpCircle` · `arrowDownCircle` |

Duplicate-glyph aliases are kept for backwards compatibility: `boxes`↔`stock`, `book`↔`ledger`, `box`↔`package`, `swap`↔`transfer`.

**Logo treatment.** The `<Logo>` component ([components/Logo.js](erp-frontend/src/components/Logo.js)) renders `logo192.png` (the HE monogram — white H + half-white E) as a plain `<img>` with **no chip / no backdrop wrapper** anywhere (`draggable=false`, `userSelect: none`). The logo appears only on `/login` (and the in-place `/request-access` mode). The wordmark "Hassan Electronics" appears in the sidebar brand block.

---

## 3. Application shell

The shell is rendered by [components/Layout.js](erp-frontend/src/components/Layout.js). CSS grid: sidebar (240 px, or 56 px rail) + main column (1fr). Topbar is sticky at 44 px. Provider nesting is `<ThemeProvider>` (outside the router) → `<HashRouter>` → `<AuthProvider>` → routes; the shell uses **HashRouter** so the build works under Electron `app://`.

```
┌──────────────┬────────────────────────────────────────────────┐
│              │ ☰  [GlobalSearch]                ↻ 🔔 user ☀ │ ← topbar
│   sidebar    ├────────────────────────────────────────────────┤
│   (240 px)   │  ⚠ Today's backup is overdue …  Dismiss        │ ← BackupReminder (conditional)
│              ├────────────────────────────────────────────────┤
│              │  Hub title                                     │
│              │  Hub subtitle                                  │
│              │  [Info] [Receipts] [Ledger] [Warranty] [Svc]   │ ← HubFrame tab strip
│              │  ───────────────────────────────               │
│              │                                                │
│              │  page content                                  │
└──────────────┴────────────────────────────────────────────────┘
```

Auth gating: while `loading` the shell shows a `login-shell` "Loading…"; if `!user` it `<Navigate to="/login">` (carrying the attempted path in `state.from`). The only routes outside the authenticated `Layout` are `/login` and the four `/print/*` routes.

### 3.1 Sidebar

Defined in [nav/hubs.js](erp-frontend/src/nav/hubs.js) (`SIDEBAR` array, built from `HUBS`). Rendered by [components/Layout.js](erp-frontend/src/components/Layout.js); the brand block uses [components/Brand.js](erp-frontend/src/components/Brand.js).

**Brand block** — top of sidebar, 44 px tall, no border-bottom (the Electron title-bar overlay can't paint over a border, so the seam would look broken; the sidebar right-edge + bg contrast supply separation instead).

| Element | Text / icon |
|---|---|
| Rail toggle | `.brand-toggle` button, `<Icon name="menu" size={18}/>`, aria-label/title `"Expand sidebar"` / `"Collapse sidebar"`. Storage key `hassan-sidebar-rail` (`'1'`/`'0'`). |
| Wordmark | `.brand-name` `"Hassan Electronics"` (display font, hidden in rail mode). No logo image in the sidebar — wordmark only. |

**Navigation entries — 13 items, in order.** Each row is `.nav-item` and `flex: 1 1 0` so items grow to fill the column height (≥40 px, ~52–64 px on tall viewports). Active row (`.active`) paints a 3 px solid `var(--nav-c)` left border, lifts background to `--surface-hover`, and bumps font-weight to 600. The 24×24 icon sits in `.nav-icon`. Highlight is `NavLink` `isActive` **OR** a custom `hubMatch` (any path in the hub's `paths` equals the pathname or is a prefix), so a hub stays lit on its sub-routes and ledger detail pages.

| # | Label | Icon | Default route | Color |
|---|---|---|---|---|
| 1 | `"Dashboard"` | `dashboard` | `/` (`end`) | `--nav-dashboard` |
| 2 | `"Cash Book"` | `cash` | `/cash-register` | `--nav-cashbook` |
| 3 | `"Customer"` | `user` | `/customers` | `--nav-customer` |
| 4 | `"Sales"` | `receipt` | `/sales-voucher` | `--nav-sales` |
| 5 | `"Supplier"` | `package` | `/suppliers` | `--nav-supplier` |
| 6 | `"Purchase"` | `package` | `/purchases` | `--nav-purchase` |
| 7 | `"Item"` | `package` | `/items` | `--nav-item` |
| 8 | `"Stock"` | `stock` | `/stock` | `--nav-stock` |
| 9 | `"Employee"` | `users` | `/employees` | `--nav-employee` |
| 10 | `"Account"` | `bank` | `/accounts` | `--nav-account` |
| 11 | `"Users"` | `users` | `/users-change-password` | `--nav-users` |
| 12 | `"Reports"` | `reports` | `/financials` | `--nav-reports` |
| 13 | `"System"` | `backup` | `/backup` | `--nav-system` |

> **POS Terminal has no sidebar entry.** It was removed when the **Sales Voucher** (bill-book entry) became the default Sales-hub tab. The `/pos` route is still mounted — reachable by typing the URL or via a bookmark, for cashiers who prefer the scan-driven session flow. (The `--nav-pos` token and `pos` icon still exist for that page's chrome.)

The Sales sidebar click lands on `/sales-voucher` because the voucher is the daily entry point — it mirrors how the owner uses a physical bill book; history sits one tab over.

**Mobile (≤ 860 px)** — sidebar becomes a fixed off-canvas drawer (`transform: translateX(-100%)` → `0` when `[data-nav="open"]` on `.app`). A `.scrim` overlay closes the drawer; the drawer also auto-closes on route change. A `.mobile-menu-btn` appears in the topbar.

### 3.2 Topbar

Sticky, 44 px, background `var(--surface-elev)`, no border-bottom. The whole bar is the Electron drag region (`-webkit-app-region: drag`); interactive children opt back out (`no-drag`), and right padding is computed from `env(titlebar-area-*)` to reserve the Windows window-controls space. Left-to-right:

| Element | Text / state |
|---|---|
| Mobile menu button (≤ 860 px) | `<Icon name="menu" size={18}/>`. |
| **GlobalSearch** (omnibox) | `<Icon name="search" size={15}/>` + input. Placeholder `"Search by code, name, phone, SKU…"`. Lazy-loads data on first focus (customers, suppliers, employees, accounts, items), filters client-side, max 8 results. Result kind chips: `"Customer"`, `"Supplier"`, `"Employee"`, `"Account"`, `"Item"`. Popover states: `"Loading…"`, `"No matches."`, plus the backend error on failure. Keyboard: Esc closes+blurs, Enter selects the first hit. See §6.7. |
| Spacer | flex: 1 |
| **SyncButton** | `<Icon name="rotate" size={16}/>` (CSS `sync-spin` 0.9 s linear while busy). **Hidden entirely** when `CLOUD_SYNC_URL` is unset (polls `GET /sync/status` every 30 s; on poll error treats cloud as unconfigured). Title is one of `"Syncing…"`, `"Sync now — N event(s) pending"`, `"Sync now — N pending, M skipped due to errors"`, `"Sync now — outbox is empty"`. Red pending badge (capped `"99+"`). After a `POST /sync/flush`, a 3-second flash pill: ok (`--success`) / warn (`--warning`, e.g. cloud not configured) / err (`--danger`), text from the backend `summary.message` or `err.uiMessage`. |
| **LoginBell** (superuser only — returns `null` otherwise) | 🔔 emoji. Polls `GET /users/login-events/unseen-count` + `GET /users/access-requests/pending-count` every 30 s; red badge = `logins + requests`. Panel headings `"Pending access requests (N)"` / `"Recent logins"`, link `"Review in Users"` → `/users`. On open it optimistically `POST /users/login-events/mark-seen`. Closes on outside mousedown. |
| **UserChip** | `<Icon name="user"/>` + `username` (bold) + `· admin` (muted, if superuser). Trailing `"Logout"` opens a confirm modal. |
| **ThemeToggle** | `<Icon name="sun" size={16}/>` when dark, `<Icon name="moon" size={16}/>` when light. aria/title reflect the target mode. |

**Logout confirm modal** (LogoutConfirm — opens before the actual logout, so a touch/POS mis-tap mid-sale doesn't sign the user out):

```
Sign out?
…confirmation copy…

[Stay signed in]   ← autofocus      [Sign out]   ← btn-danger
```

### 3.3 BackupReminder banner

Mounted in `<Layout>`, polls `GET /backup/status` on mount + every 5 minutes. Renders only when `status.overdue === true` and the user has not dismissed it in the current browser session (sessionStorage key `backup-reminder-dismissed`). Fetch errors are silently ignored (the backend may not be up yet).

```
⚠ Today's backup is overdue — scheduled for {HH}:00. Take it now    [Dismiss]
```

`"Take it now"` is a `<Link to="/backup">`; the banner uses `.alert.alert-error` with a 3 px left border in `var(--danger)`.

### 3.4 HubFrame (title + tab strip)

Wrapper for every hub. File [components/HubFrame.js](erp-frontend/src/components/HubFrame.js). Renders:

```html
<header class="hub-head">
  <h1>{title}</h1>            ← e.g. "Customers"
  <p>{subtitle}</p>           ← e.g. "Customer info, receipts received, ledger, warranty lookup, and service tickets."
</header>
<nav class="hub-tabs">
  ← horizontal tab strip — 14 px icon + label; underlined when active (2 px var(--info), dark → var(--border-glow))
</nav>
<div class="hub-body"><Outlet/></div>
```

Tabs are `<NavLink>` (partial-prefix match, so `/customer-ledger` stays active on `/customer-ledger/:id`). Tabs marked `superuserOnly` in [nav/hubs.js](erp-frontend/src/nav/hubs.js) are filtered out for regular users (UI hint only — the backend re-enforces). The `hub-body` CSS suppresses the sub-page's own `<h1>`/single-child `page-head` so the hub title + active tab aren't duplicated; standalone routes (e.g. `/master`) keep their heading.

### 3.5 Unsaved-changes guard

Hook: [hooks/useUnsavedChangesPrompt.js](erp-frontend/src/hooks/useUnsavedChangesPrompt.js). Guards both tab-close/refresh (`beforeunload`, sets `e.returnValue=''`) and in-app navigation while a form is dirty. Because the app uses `<HashRouter>` (not a data router, so RR7 `useBlocker` is unavailable), in-app nav is intercepted by a **document-level capture-phase `click` listener** that walks up to the nearest `<a>`, only intercepts hash-route links, skips modifier-clicks/same-route, and calls `window.confirm`. Programmatic navigation is intentionally **not** blocked. Default message:

> "You have unsaved changes. Leave this page and discard them?"

Every form-bearing page wires `useUnsavedChangesPrompt(isDirty)` where `isDirty` is a JSON-compare of the live form against its blank state.

---

## 4. Authentication screens

### 4.1 Sign in — `/login`

File [pages/Login.js](erp-frontend/src/pages/Login.js). Single card with a `mode` state (`'login'` / `'request'`), `min(420px, 96vw)`, 1 px solid `--border-strong` border, `--shadow-lg` shadow. Background `--bg`.

- **Theme toggle** at top-right (`<ThemeToggle>`).
- **Logo** centered, `<Logo size={72}>` transparent monogram, no chip.
- **Heading:** `"Sign in"`
- **Subtitle (muted):** `"Welcome to Hassan Electronics ERP. Use the credentials provided by your administrator."`

| Field | Label | Attributes |
|---|---|---|
| Username | `"Username"` | `autoFocus` |
| Password | `"Password"` | `type="password"` |

- **Error banner:** `<div class="alert alert-error">` showing `err.uiMessage` or `"Sign-in failed"`.
- **Primary button:** `"Sign in"` (busy → `"Signing in…"`). On success → `nav(loc.state?.from || '/')`.
- **Aside link:** `"Request access"` (`btn-link`) switches the card to Request Access mode.

### 4.2 Request access (in-place mode on `/login`)

- **Heading:** `"Request access"`
- **Subtitle (muted):** explains the admin reviews + assigns a username/password.

| Field | Label | Attributes |
|---|---|---|
| Desired username | `"Desired username *"` | required, minLength 2 |
| Full name | `"Full name *"` | required, minLength 2 |
| Phone | `"Phone"` | optional |
| Email | `"Email"` | optional |
| Reason | `"Reason / role you'd take on"` | textarea |

- **Buttons:** `"Submit request"` (busy → `"Submitting…"`), `"Cancel"`. Posts to public `POST /auth/request-access`.

**Success state** (after submit): `"Request received"` + body telling the user the admin was notified and they can sign in once approved + a password is assigned. Button `"Back to sign in"`.

---

## 5. Pages

The sections below walk through every page in sidebar order. Each hub is rendered inside a `<HubFrame>` (title + tab strip).

---

### 5.1 Dashboard — `/`

File [pages/Dashboard.js](erp-frontend/src/pages/Dashboard.js). On mount it fires 14 parallel reads (cash-register day, stock summary, income statement MTD, customer/supplier balances, AR/AP aging, slow-moving stock, sales, purchases, payments, fund-transfers, incentive progress, deferred upcoming).

**Header**

| Element | Text |
|---|---|
| Title | `"Today at the shop"` |
| Subtitle | dynamic long date, e.g. `"Sunday, 18 May 2026"` (en-GB) |
| Right action | `"Export"` `<Link to="/financials">` with `<Icon name="download"/>` |

**4-up stat row** (`.grid-stat`, each with a gradient `orb`)

| Card | Label | Unit | Footer | Indicator |
|---|---|---|---|---|
| 1 | `"Today's sales"` | `"Rs"` | `"N invoices today"` | ▲ |
| 2 | `"Cash in till"` | `"Rs"` | `"N entries"` | ▲ |
| 3 | `"Items low on stock"` | — | `"N critical"` | ▼ |
| 4 | `"Adjusted Net Income (MTD)"` | `"Rs"` | `"+ Rs X incentives"` or `"No incentives yet"` | ▲ |

**Revenue card** (`.grid-2` left) — heading `"Revenue, last 14 days"`, sub `"Net of returns & discounts"`. Range toggles `"14d"` / `"30d"` / `"90d"` (drive `revenueDays`). Inline SVG `RevenueChart` (violet→cyan→pink gradient stroke). Empty state `"Not enough data yet"`.

**Latest activity card** (`.grid-2` right) — heading `"Latest activity"`, sub `"Sales · returns · receipts · transfers"`. Merges sales/purchases/payments/transfers, newest 6. Row = 36 px icon chip (icon by kind: `package`/`receipt`/`transfer`/`card`) · party + ref · amount · status chip. Chips: `"Paid"` (success), `"Partial"` (warn), `"Unpaid"` (info), `"Received"` (info), `"Purchase"` (info), `"Transferred"` (violet). States `"Loading…"` / `"No recent activity yet."`.

**Top selling card** (`.grid-3`) — eyebrow `"Top selling — last 14 days"`. Horizontal mini-bars: `{name}` · `"N sold"`.

**Receivables · Payables card** — eyebrow `"Receivables · Payables"`. Row 1 `"Owed to you"` (green) with oldest-AR line color-graded (≥30 danger / ≥15 warning / else muted) `"Oldest unpaid: Nd (name)"` + a `StackedBar` of AR buckets; link → `/customer-ledger`. Row 2 `"You owe"` (pink) with oldest-AP + AP-bucket `StackedBar`; link → `/supplier-ledger`.

**Cash Trap · Inventory aging card** (only when slow-moving rows exist) — tallies `valueAtCost` by bucket. A `Donut` (size 120) with segments Fresh (<30 d, green) / Slowing (30–60 d, amber) / Cold (60–90 d, orange) / Dead (90 d+, red); center = locked % `(cold+dead)/total`, label `"locked"`. Footer warning (red when lockedPct ≥ 30): `"Rs X of inventory has not moved in 60+ days. Consider clearance pricing."`.

**Upcoming deferred collections card** (only when promises exist) — sub `"Customer pay-later promises landing within the next 7 days."`. Up to 6 rows `{customerName, invoiceNo, phone, remainingAmount, dueDate}` with a chip: danger when overdue, info otherwise; labels `"Overdue Nd"` / `"Due today"` / `"Due in Nd"`. Tail line `"+N more in the next week"`.

**Incentive card** (border-left 3 px primary) — eyebrow `"Incentive · this period"`. With an active target: heading `"{target.name}"`, sub `"{netQty} / {targetQty} units sold · Rs {potentialIncentive} unlocks at {targetQty}"`, progress bar, link `"View progress"` → `/incentives`. Without: `"No active targets"` + `"Add target"` link.

---

### 5.2 POS Terminal — `/pos` (no sidebar entry; URL-only)

File [pages/POS.js](erp-frontend/src/pages/POS.js). Server-side session state (`pos_sessions` + `pos_cart_items`). **Keyboard shortcuts** (unmodified): **F2** focus+select scan input, **F4** focus customer picker, **F8** checkout, **F9** clear cart.

**No-session state**

- Title `"POS"`. Card heading `"Start a POS Session"`, body `"Open a cashier session before billing. Cart and totals are tracked per session."`.
- Fields `"Store (optional)"` (default `"— None —"`), `"Opening cash float"`. Button `"Start Session"`.

**Active session header** — title `"POS"`; muted meta `"Session {id8} · started {time} · {salesCount} sales · {salesTotal}"`; button `"Close Session"`.

**Success banner after a sale** — shows invoiceNo, net, paid. If `dueAmount > 0`: a **BOOKING HOLD** alert with balance + links `#/print/sale/{id}`, `#/print/booking-receipt/{id}`, `#/print/box-tag/{id}`. If `dueAmount < 0`: "Change due". Always a "Print receipt" link.

**Scan card** — bolt icon + monospace input, placeholder `"Type model no. — e.g. DAWLANCE LVS-15"`. Scan error shown as a red chip (e.g. `"Item not found"`).

**Cart table**

| Column | Header / content |
|---|---|
| Item | model no. (bold) + brand (muted mono). Cost chips driven by avgCost vs incentive credit: `"+ Rs N/unit incentive"` (chip-info), `"Below cost"` (chip-danger), `"Below raw cost · incentive covers"` (chip-warn). |
| Qty | `−` / number / `+` stepper |
| Price | mono, right-aligned |
| Total | mono, right-aligned |
| — | `×` delete |

Per-item **serial sub-row** (when `item.tracksSerials !== false`): label colored by state (`required` → warning, else success/muted), shows `(enteredCount/quantity)` and a status suffix (`✓` / `· optional` / `— required` / `· need 0 or all`); a textarea (`rows = min(3, qty)`). When the item `isInternalGenerated`, a `"+ Generate & Print Local IDs (N)"` button mints `LOCAL-…` serials and opens up to the first 5 as `#/print/serial-label/<serial>` tabs.

Empty cart: `"Cart is empty. Type a model no. above to add."`

**Checkout sidebar** (`aside.pos-summary`, sticky)

- Heading `"Checkout"`.
- Totals: `"Subtotal"` · `"Discount"` (input, `placeholder="0.00"`) · `"Net"` · `"Paid"` (input; blank = pay full net; disabled & `0` for CREDIT) · last line switches between `"Receivable"` / `"Change"` / `"Due"`.
- Credit/partial info alert: `"Full {amount} will be added to customer's A/R."` or `"{receivable} will be added to customer's A/R."`. A `"Promise to pay by"` date input (min today) appears for credit/partial → forwarded as `expectedPaymentDate`.
- `"Customer"` selector — default `"— Walk-in —"`; `+` button (title `"Add new customer"`).
- `"Payment method"` buttons: `"CASH"`, `"CARD"`, `"BANK"`, `"CREDIT"` (active = btn-primary). CASH → cash-drawer account picker labeled `"Cash drawer"`; CARD/BANK → `"Deposit to"` (BANK/WALLET accounts); CREDIT strips the account. When no eligible accounts: `"Add one under Master Data → Bank / Wallet"`.
- Checkout error alert prints the backend message (e.g. `"Select a customer for partial payments — the unpaid balance must be tracked as a receivable."`, `"Select a customer for CREDIT sales so the receivable is tracked."`).
- Footer: `"Clear"` (ghost) + `"Checkout · {net}"` (disabled when busy / empty cart).

Serial validation mirrors the backend (required → exactly `qty`; optional → 0 or `qty`; no duplicates) before posting `/pos/sessions/{id}/checkout`. After the sale persists, serials bind: partial pay (`dueAmount > 0.005`) → `reserveForBooking` (BOOKED); full pay → `bindToSale` (DELIVERED + warranty stamp).

**New Customer modal** — title `"New Customer"`. Fields `"Name *"` (autoFocus), `"Phone"`, `"Email"`, `"Address"`. Buttons `"Cancel"`, `"Create"` (busy → `"Saving…"`).

---

### 5.3 Cash Book — `/cash-register`

File [pages/CashRegister.js](erp-frontend/src/pages/CashRegister.js). One session per shop-day; variance recorded numerically (no journal posting).

**Header** — title `"Cash book — {date}"`, subtitle `"Session-based daily till · running balance per row"`. Conditional right buttons: `"▶ Open Today's Register"` (no session, today), `"■ Close Register"` (open session), `"+ New Entry"` (session exists; disabled+titled `"Register is closed for this date"` when closed).

**Date picker card** — label `"Date"`, button `"Refresh"` (busy → `"Loading…"`).

**Variance trend card** (only when ≥1 closed session) — `MiniLine` over the last 30 closed sessions, `formatY` → `Rs ±n.nn`, with a footer counting surplus days / short days / net.

**No-session banners** — today: `"Register not opened for today"` + expected-opening copy; past date: `"No session for {date}"` + computed-opening copy.

**Session banner** — `"Session {sessionDate} · OPEN|CLOSED"` + a detail line of expected/actual opening (and closing when closed). Chip: `"No discrepancies"` (success) or `"Variance recorded"` (warn).

**4-up stats** — `"Opening Cash"`, `"Cash In"` (green orb), `"Cash Out"` (red orb), `"Closing Cash"` (red accent if negative). All prefixed `"Rs"`.

**Activity table**

| Column | Notes |
|---|---|
| `"Time"` | `toLocaleTimeString()` |
| `"Ref"` | mono |
| `"Category"` | badge — `"MISC"` red, others gray |
| `"Description"` | text |
| `"In"` / `"Out"` | right-aligned |
| `"Running"` | right-aligned bold |
| — | delete button **only** on `source === 'CASH_ENTRY'` rows |

Empty state `"No cash activity on this date."`. MISC-warning surfaces in the day's report (≥ Rs 1000 and > 10% of throughput).

**Open Register modal** — title `"Open Cash Register — {date}"`. `"Expected Opening (from prior day)"` (read-only), `"Actual Cash Counted *"` (autoFocus), `"Difference"` (color-coded: 0 neutral, <0 danger, >0 success). Conditional shortfall/overage alerts. Optional checkbox `"Book a fund transfer along with opening"` revealing `"From Account *"`, `"To Account *"`, `"Amount *"`, `"Transfer Notes"` (default to-account = first CASH account, default amount = shortfall). `"Opening Notes"`. Buttons `"▶ Open Register"` / `"Cancel"`. The transfer + session open share one DB transaction.

**Close Register modal** — title `"Close Cash Register — {sessionDate}"`. **Denomination counter** `DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10]` (biggest-first), a fieldset table Note / Count / Subtotal + Total. `"Actual Cash Counted"` is read-only (auto-summed from counts) with a separate `"Or override the total directly"` input. `"Difference"` (color-coded), `"Closing Notes"`. Buttons `"■ Close Register"` / `"Cancel"`. Zero counts are dropped before sending `closingDenominations`.

**New Cash Entry modal** — title `"New Cash Entry"`. Fields `"Date *"`, `"Direction *"` (`"Cash Out (paid out)"` default / `"Cash In (received)"`), `"Category *"` (`"Expense (rent, tea, transport…)"`, `"Miscellaneous (unclassified)"`, `"Opening adjustment"`, `"Closing adjustment"`, `"Other"`), `"Amount *"`, `"Account"` (`"— None —"`), `"Description"`, `"Notes"`. MISC alert flags unclassified entries. Buttons `"Save Entry"` / `"Cancel"`.

---

### 5.4 Customer hub — `/customers`

Hub title `"Customers"` · subtitle `"Customer info, receipts received, ledger, warranty lookup, and service tickets."` Tabs: **Info · Receipts · Ledger · Warranty · Service**.

#### Tab — Info (`/customers`)

`CustomersPanel` in [pages/MasterData.js](erp-frontend/src/pages/MasterData.js) (a `PartyPanel` loading computed balances from `/reports/customer-balances`).

- Panel heading `"Customers"`. Toolbar `<ExportButtons>` + `"+ Add Customer"`.
- Search label `"Quick search"`, placeholder `"Type code, name, phone, email, or address…"`. Summary `"{filtered} of {total}"`.

Form (`"New"` / `"Edit"`): `"Code"` (placeholder `"Auto-generated if blank"`), `"Name *"`, `"Phone"`, `"Email"`, `"Opening Balance"`, `"Address"` (textarea), `"Active"` (checkbox). Buttons `"Create"` / `"Update"`, `"Cancel"`.

Table columns: `"Code"` · `"Name"` · `"Phone"` · `"Email"` · `"Opening"` · `"Balance"` · `"Status"` · `"Actions"`. Balance badge color: `bal>0` red, `bal<0` green, else gray. Status column text via `balanceLabel`: `"Owes us"` / `"We owe them"` / `"Settled"`. `"CLOSED"` chip on closed rows (opacity 0.55). Row actions `"Ledger"` (→ `/customer-ledger/:id`), `"Edit"`, `"Close"` / `"Reopen"`, `"Delete"`. Empty `"No records yet."` / `"No matches."`.

#### Tab — Receipts (`/receipts`)

`<VoucherPage direction="IN">` (see §6.3). Heading `"Receipts"`, button `"+ New Receipt"`, form `"New Receipt Voucher"`. Party `"Customer *"` with hint `"Outstanding A/R: {amount}"` / `"Customer credit: {amount}"` / `"Settled."`. Columns Voucher #/Date/Customer/Account/Amount/Notes. Row action `<ReverseAction endpoint="/payments">`.

#### Tab — Ledger (`/customer-ledger`, `/customer-ledger/:id`)

File [pages/CustomerLedger.js](erp-frontend/src/pages/CustomerLedger.js). Picker `"— Select customer —"` (auto-selects first). Selected card: name + contact line. When AR-aging detail exists, an `<AgingPanel title="Outstanding invoices" numKey="invoiceNo" showPromiseColumn>` renders above the ledger. Body is `<LedgerView>` (see §6.8). Empty `"Select a customer to view their ledger."`.

#### Tab — Warranty (`/warranty-lookup`)

File [pages/WarrantyLookup.js](erp-frontend/src/pages/WarrantyLookup.js). Counter warranty lookup with a `.tab-strip` of 4 modes:

| Mode | Label | Endpoint |
|---|---|---|
| serial | `"Serial number"` | `GET /item-serials/warranty/:serial` (public) |
| invoice | `"Receipt no."` | `GET /sales/warranty/by-invoice/:invoiceNo` |
| customer | `"Customer"` | `GET /sales/warranty/by-customer/:customerId` |
| model | `"Model + date"` | `GET /sales/warranty/by-model?itemId=&from=&to=` |

- **Serial** → mono input (autoFocus, placeholder `"e.g. SN-A12B34"`), button `"Lookup"`. Renders a `<SerialCard>` with status chip (priority order): `"On hold · payment pending"` (BOOKED, warn), `"Available for sale"` (AVAILABLE+IN_STOCK, info), `"Returned to shop"` (RETURNED, warn), `"No warranty"` (type NONE, danger), `"Checked at sale · no warranty"` (CHECKING_ONLY, warn), `"Active warranty"` (SOLD+active, success), `"Warranty expired"` (SOLD, danger). Detail grid: Serial (mono), Sold on, Warranty type/start/end, Length (days). Miss → `"No record found"`.
- **Receipt no.** → mono input; renders a summary line + one `<LineCard>` per receipt line (empty → `"No lines on this receipt."`).
- **Customer** → customer select; LineCard list (empty → `"No purchases on record"`).
- **Model** → item select + From/To dates; LineCard list with customer column (empty → `"No sales of this model in the selected window."`).

`<LineCard>` chip via `lineChip`: `"No warranty"` / `"Checked at sale · no warranty"` / `"No warranty recorded"` / `"Active warranty"` / `"Warranty expired"`. Serial-tracked lines also show a `"serial-tracked"` chip-info (look up by serial for the precise per-unit answer).

#### Tab — Service (`/service-tickets`)

File [pages/ServiceTickets.js](erp-frontend/src/pages/ServiceTickets.js). Repair/warranty-claim workflow. Statuses (chip): `RECEIVED` (info), `SENT_TO_COMPANY` (info), `WAITING_PARTS` (warn), `UNDER_REPAIR` (warn), `READY_FOR_PICKUP` (success), `DELIVERED` (success), `UNREPAIRABLE` (danger).

- Header + `"+ New ticket"`. A `.grid-stat` of per-status stat tiles (count from `GET /service-tickets/tally`). A `FunnelStages` pipeline card (eyebrow notes a bloated "Sent to Company" = manufacturer dragging warranty claims).
- Form offers three warranty-resolution paths feeding one ticket:
  - **Serial lookup** → `GET /item-serials/warranty/:serial`; sets itemDescription + inWarranty.
  - **Receipt-no lookup (model-only)** → `GET /sales/warranty/by-invoice/:invoiceNo`; lists lines in a sub-card (warranty chip per line) with an `"Attach"` button to link a `saleItemId`. Shows `"✓ Linked to a receipt line (model-only warranty)."`.
  - Manual `"itemDescription"` + manual `"In warranty?"` checkbox.
  - Other fields: `"Customer"` (`"— Walk-in —"`), `"Complaint *"` (textarea, required), `"Status"`, `"Received on"`, `"Estimated completion"`, `"Estimated cost"`, `"Actual cost"`, technician/resolution notes.
- Table: Ticket # · Received · Customer · Item (serial mono + description) · Complaint · Status chip · Warranty (`"In warranty"` success / `"Out of warranty"`) · Actions (Edit / Delete).

---

### 5.5 Sales hub — `/sales-voucher`

Hub title `"Sales"` · subtitle `"Bill-book voucher entry, posted invoices, returns, deliveries, and overdue bookings."` Tabs: **New Voucher · History · Returns · Deliveries · Overdue Bookings**. The sidebar lands on **New Voucher**.

#### Tab — New Voucher (`/sales-voucher`)

File [pages/SalesVoucher.js](erp-frontend/src/pages/SalesVoucher.js). The whole submission is built client-side and posted atomically to `POST /sales/voucher` (`SalesService.createFromVoucher`) — one Sale + N receipt splits, rolled back fully if any split fails. **Keyboard:** F2 focus scan, Ctrl/Cmd+Enter submit.

- Header `"Sales Voucher"` + sub `"Bill-book entry · multi-tender · atomic"`.
- **Customer section** — eyebrow with `"+ New customer"` / `"Close"` toggle (inline create card: `"Name *"` / `"Phone"` / `"Address"`, `"Save & select"` / `"Cancel"`). Customer select shows a balance tail per option (`"— owes X"` / `"— credit X"`) and a note of open A/R or held credit below.
- **Items section** — F2/Ctrl+Enter hint; a mono scan input (Enter → `/items/lookup`, stacks onto a matching line or appends). Lines table: Item select (`name · sku`) / Qty / Unit price / Line total / `×`. Per-tracked-serial sub-row textarea with `(parsedCount/qty)` and required/optional state. `"+ Add item"`.
- **Discount + net** — `"Discount"` input + Gross + Net.
- **Payment splits section** — table Account / Amount / Reference / `×`. The account `<select>` is tri-valued: blank (first row labels the cash account), `"Customer credit · available X"` (offered only when `availableCredit > 0`), or a CASH/BANK/WALLET/CASH_ON_HAND account. `"+ Add split"`.
- **Deferred-cash schedule section** (only when `residual > 0`) — checkbox `"Schedule remaining {X} as deferred cash"` (routes residual to Deferred Cash Receivables, dashboard chases it); when on, a Due date / Expected amount / Notes table + `"+ Add due date"` and a `"Scheduled X / residual Y (off by Z)"` indicator (red on mismatch).
- **Footer totals** — Net / Paid (red if over-split) / Residual (to A/R; colored red<0 / success 0 / warn >0).
- **blockReasons** alert — `"Save is blocked — fix the following:"` + a `<ul>` (missing item/qty/price, serial-count failures, over-split, customer-credit over-applied, schedule mismatch, etc.). `"Save voucher"` (disabled while blocked, `title` = joined reasons) + `"Reset"`. On success → opens `#/print/sale/{id}` and navigates to `/sales#<invoiceNo>`.

#### Tab — History (`/sales`)

File [pages/Sales.js](erp-frontend/src/pages/Sales.js). Read-only.

- Heading `"Sales History"`, search placeholder `"Search invoice, customer, method..."`.
- Info banner: sales are created at POS / via the voucher; this page is read-only history; points to Customer → Receipts for collections and the Customer Ledger tab for net A/R.
- Columns: `"Invoice #"` · `"Date"` · `"Customer"` · `"Total"` · `"Net"` · `"Paid at sale"` · `"Method"` · `"Promise"` · `"Actions"`.
- Promise chip (from the first PENDING commitment): `"Overdue · {date}"` (red) / info chip with the due date / `"—"`.
- Row actions: `"Print"` (`#/print/sale/{id}`); when `dueAmount > 0` also `"Hold Slip"` (`#/print/booking-receipt/{id}`) and `"Box Tag"` (`#/print/box-tag/{id}`); plus `<ReverseAction endpoint="/sales">`.
- States `"Loading…"` / empty (search-aware copy).

#### Tab — Returns (`/sale-returns`)

File [pages/SaleReturns.js](erp-frontend/src/pages/SaleReturns.js). Goods returned by a customer (stock IN). Heading `"Sale Returns"`, button `"+ New Sale Return"`. Form `"New Sale Return"`: `"Customer"` (`"— None —"`), `"Store"` (`"— Default —"`), `"Reason"`, line items (`"Item"` `"— Select —"` + an inline mono serial input below the select for serial-tracked items, `"Qty"`, `"Unit Price"`, `"Line Total"`, `×`), `"+ Add Line"`, `"Total Returned"`. Buttons `"Save Return"` / `"Cancel"`. Unit price prefills from item `salePrice`. List columns `"Return #"` · `"Date"` · `"Customer"` · `"Total"` · `"Reason"`. No reverse/delete from this page (history is immutable here). Note: `saleId` is in the payload but has no form control — returns are unlinked to their origin voucher from this page.

#### Tab — Deliveries (`/deliveries`)

File [pages/Deliveries.js](erp-frontend/src/pages/Deliveries.js). Operational handover tracking (stock already deducted at sale time; the only inventory effect is the `Item.reservedQty` overlay). Statuses (chip): `PENDING` (info), `OUT_FOR_DELIVERY` (warn), `DELIVERED` (success), `INSTALLATION_PENDING` (warn), `INSTALLED` (success), `CANCELLED` (danger). The first three reserve inventory.

- Heading `"Deliveries"`, `"+ New delivery"`.
- A `FunnelStages` **delivery pipeline** card (tally computed from loaded rows; bloated stages = transport backed up).
- Form: Sale select (filters out reversed, shows `invoiceNo · customer`), Customer (if no sale), Status, Scheduled-for date, Address, Phone, `"Assigned to"` (placeholder `"Driver / delivery boy"`), `"Vehicle"`, Notes. POST/PATCH `/deliveries`.
- Table: Delivery # · Sale · Customer · Scheduled · Status chip · Assigned · Actions (Edit / Delete).
- **Strict-handover guard**: transitioning to `DELIVERED` is rejected with a 400 when the linked sale still has `dueAmount > 0` (`"Cannot mark delivery … customer still owes Rs … Collect the balance via Customer → Receipts first."`).

#### Tab — Overdue Bookings (`/overdue-bookings`)

File [pages/OverdueBookings.js](erp-frontend/src/pages/OverdueBookings.js). Surfaces sales where the customer paid an advance, the unit is still BOOKED, and the booking is older than `minDays`.

- Heading `"Overdue Bookings"`. Toolbar: `"Show bookings older than … days"` number (default 7) + `"Refresh"`.
- Persistent info alert explaining Release-to-Floor flips serials BOOKED→AVAILABLE and the advance stays as customer credit (not auto-refunded).
- Columns: `"Customer"` (name + mono phone) · `"Invoice"` · `"Booked On"` · `"Days Held"` (right, mono, red ≥7) · `"Units"` (one line per serial: `itemName · serial`) · `"Advance Paid"` · `"Remaining Due"` · `"Actions"`.
- Row actions: `"Box Tag"` (`#/print/box-tag/:saleId`) + `"Receipt"` (`#/print/booking-receipt/:saleId`) + `"Release"` (`btn-warn`).
- **Release modal**: lists the units reverting; if advance > 0 a warning that release does NOT auto-refund (refund manually via Customer → Receipts → Reverse); optional `"Reason"`; `"Cancel"` / `"Release to Floor"`. Posts `/sales/:id/release-booking`.

---

### 5.6 Supplier hub — `/suppliers`

Hub title `"Suppliers"` · subtitle `"Supplier info, brands, money out, incentives, and ledger."` Tabs: **Info · Brands · Payments · Incentives · Ledger**.

#### Tab — Info (`/suppliers`)

Same `PartyPanel` shape as Customer → Info, loading `/reports/supplier-balances`. Button `"+ Add Supplier"`. Balance helper: `"We owe them"` / `"They owe us"` / `"Settled"`. Row `"Ledger"` → `/supplier-ledger/:id`.

#### Tab — Brands (`/brands`)

`BrandsPanel` (`<CrudPage>`) in MasterData.js. Tile heading `"Brands"`, desc `"Manufacturer brand list with descriptions."`. Form `"Name"` (required), `"Description"`, `"Active"` (default on). Columns `"Name"` · `"Description"` · `"Active"` (green/gray `"Yes"`/`"No"` badge).

#### Tab — Payments (`/payments`)

`<VoucherPage direction="OUT">`. Heading `"Payments"`, button `"+ New Payment"`, form `"New Payment Voucher"`. Party `"Supplier *"` with hints `"Outstanding A/P: {amount}"` / `"Supplier owes us: {amount}"` / `"Settled."`. Otherwise identical to Receipts.

#### Tab — Incentives (`/incentives`)

File [pages/Incentives.js](erp-frontend/src/pages/Incentives.js). Manufacturer/brand **quantity** targets (distinct from employee commission). `report-tabs` strip with three sub-tabs: **Targets & Progress · Manage Targets · Booked Awards**.

**Targets & Progress** — columns `"Target"` · `"Basis"` · `"Period"` · `"Target Qty"` · `"Net Sold"` · `"Progress"` (a `Bullet` with `threshold` + `"{progressPct}%"`) · `"Incentive"` · `"Status"`. Status badge `"✔ Achieved"` (green) / `"N to go"` (gray).

**Manage Targets** — heading `"Incentive Targets"`, button `"+ New Target"`. Form `"New Target"` / `"Edit Target"`: `"Name *"` (placeholder `"e.g. Q3 Inverter Push"`), `"Basis *"` (`"Specific Item"` / `"Entire Brand"`), conditional `"Item *"` / `"Brand *"`, `"Supplier (optional)"`, `"Period Start *"`, `"Period End *"`, `"Target Quantity *"`, `"Incentive Amount *"`, `"Trigger threshold %"` (default 80, hint about POS surfacing the per-unit discount), `"Notes"`, `"Active"`. Table columns `"Name"` · `"Basis"` · `"Period"` · `"Target Qty"` · `"Incentive"` · `"Status"` · `"Actions"` (Edit / Delete).

**Booked Awards** — heading `"Booked Incentive Awards"`, button `"+ Book Award"`. Form: `"Linked Target (optional)"` (`"— None / one-off —"`, autofills label/amount/period), `"Label *"`, `"Awarded On *"`, `"Amount *"`, `"Period Start"`/`"Period End"`, `"Notes"`. Summary `"Total Booked: {amount}"`. Columns `"Awarded On"` · `"Label"` · `"Linked Target"` · `"Period"` · `"Amount"` · `"Actions"` (Delete).

#### Tab — Ledger (`/supplier-ledger`, `/supplier-ledger/:id`)

File [pages/SupplierLedger.js](erp-frontend/src/pages/SupplierLedger.js). Mirror of Customer Ledger; picker `"— Select supplier —"`. AP-aging detail renders `<AgingPanel title="Outstanding bills" numKey="billNo">` (no promise column). Body `<LedgerView>`.

---

### 5.7 Purchase hub — `/purchases`

Hub title `"Purchases"` · subtitle `"Orders raised, bills posted, and purchase returns."` Tabs: **Orders · Bills · Returns**. (Sidebar lands on Bills.)

#### Tab — Orders (`/purchase-orders`)

File [pages/PurchaseOrders.js](erp-frontend/src/pages/PurchaseOrders.js). Uses the newer `.page-head` / `.input` / `.t` style with `<h1>` + subtitle.

- Title `"Purchase orders"`, subtitle `"Orders placed with suppliers — Draft → Sent → Received."`. Toolbar `<ExportButtons>` + `"+ New purchase order"`.
- Form `"New purchase order"`: `"Supplier *"`, `"Order date *"`, `"Expected delivery"`, `"Status"` (`"Draft"` / `"Sent to supplier"` / `"Received"` / `"Cancelled"`); line table `"Item"` / `"Qty"` / `"Expected unit cost"` / `"Line total"` / `×`, `"+ Add line"`, `"Total: Rs {value}"`, `"Notes"`. Buttons `"Save PO"` / `"Cancel"`.
- List columns: `"PO #"` · `"Order date"` · `"Expected"` · `"Supplier"` · `"Items"` · `"Total"` · `"Status"` · `"Actions"`. Status chips: Draft (plain), `chip-info` (Sent), `chip-success` (Received), `chip-danger` (Cancelled). Row actions: `"Send"` (Draft), `"Mark received"` (Sent), `"Cancel"` (Draft/Sent), `"Delete"` (always). PATCH `/purchase-orders/:id/status`.

#### Tab — Bills (`/purchases`)

File [pages/Purchases.js](erp-frontend/src/pages/Purchases.js). Inbound goods (purchase + stock IN + weighted-avg cost roll-up + serial intake).

- Heading `"Purchases"`, button `"+ New Purchase"`.
- Info banner: `"Bills aren't paid one-for-one. To pay suppliers, use the Payments tab — the Supplier Ledger tab shows the net balance you owe."`
- Form `"New Purchase"`: `"Supplier"` (`"— None —"`), `"Default Store (per-line below can override)"`, `"Payment Method"` (`"Cash"` / `"Bank"` / `"Credit"`); line items with `"Item"` select + inline `"+ New"` quick-add, per-line `"Store"`, `"Qty"`, `"Unit Price"`, `"Line Total"`, `×`. Per-serial-tracked line a mono serials textarea (`(N / qty)` count, "leave blank to capture serials at POS"). `"+ Add Line"`, then `"Discount"` / `"Total"` / `"Net"` / `"Paid Amount"`, `"Notes"`. Buttons `"Save Purchase"` / `"Cancel"`.
- **Quick-add Item modal** (`+ New`): title `"Quick add item"`, fields `"Model No"` / `"Name (optional, defaults to Model No)"` / `"Brand"` / `"SKU (auto-derived if blank)"` / `"Barcode"` / `"Purchase price"` / `"Sale price"`. Validation `"Model No or Name is required"`.
- List columns: `"Bill #"` · `"Date"` · `"Supplier"` · `"Total"` · `"Net"` · `"Paid at bill"` · `"Method"` · `"Actions"` (`"Print"` → `#/print/purchase/:id`, plus `<ReverseAction endpoint="/purchases">`).

#### Tab — Returns (`/purchase-returns`)

File [pages/PurchaseReturns.js](erp-frontend/src/pages/PurchaseReturns.js). Goods returned to supplier (stock OUT). Heading `"Purchase Returns"`, button `"+ New Purchase Return"`. Form mirrors Sale Returns but **no serial capture** and unit price prefills from item `purchasePrice`: `"Supplier"`, `"Store"`, `"Reason"`, lines `"Item"` / `"Qty"` / `"Unit Price"` / `"Line Total"`, `"+ Add Line"`, `"Total Returned"`. List columns `"Return #"` · `"Date"` · `"Supplier"` · `"Total"` · `"Reason"`. No reverse/delete from this page.

---

### 5.8 Item hub — `/items`

Hub title `"Items"` · subtitle `"Item catalogue and category tree."` Tabs: **Catalogue · Categories**.

#### Tab — Catalogue (`/items`)

[components/master/ItemsPanel.js](erp-frontend/src/components/master/ItemsPanel.js).

- Panel heading `"Items"`. Toolbar `<ExportButtons>` + `"+ Add Item"`. Quick search (autoFocus, backed by a `<datalist>`), placeholder mentions model/name/SKU/barcode/brand.

Form `"New Item"` / `"Edit Item"`:

| Field | Label | Notes |
|---|---|---|
| Model No. | `"Model No."` | placeholder `"e.g. DAWLANCE LVS-15 (optional for accessories)"`, helper text "optional". Either Model No. or SKU is required (`"Either Model No. or SKU is required."`). The display name tracks Model No. (falls back to SKU). |
| Brand | `"Brand"` | `"— None —"` |
| Purchase Price · Sale Price · Unit · Min Stock Level | — | numbers/text |
| Active | `"Active"` | checkbox |
| **Fieldset "Tracking & warranty"** | | |
| Track serials | `"Track serials per unit"` | checkbox |
| Serial required | `"Serial required at sale"` | only when tracking serials |
| Auto-generate local | `"Auto-generate local serials"` | only when tracking serials AND no brand; needs the category Code set (`LOCAL-{code}-{year}-{seq}`) |
| Offer warranty | `"Offer a warranty"` | checkbox; off → "NO WARRANTY COVERAGE / SOLD AS-IS" on print |
| Warranty type | `"Warranty type"` | COMPANY / SHOP / CHECKING_ONLY / NONE |
| Warranty days | `"Warranty (days)"` | only when type COMPANY/SHOP (placeholder 365) |
| **Advanced toggle** | `"+ Advanced (override SKU)"` ↔ `"− Hide advanced"` | reveals SKU override (`"Auto-derived from Model No. when blank"`) |
| Categories | `"Categories"` | `.chip-picker` multi-select using full `"Parent › Child"` paths; empty notice `"No categories yet. Add some in the Categories tile first."` |

The form encodes invariants client-side: `serialRequiredOnSale` forced off when not tracking; `warrantyType → NONE` when warranty off; `isInternalGenerated` only for serialised + unbranded.

Table columns: `"Model No."` · `"Brand"` · `"Categories"` (gray badges) · `"Purchase"` · `"Sale"` · `"Unit"` · `"Min"` · `"Status"` · `"Actions"`. Status chips `"Active"` (success) / `"Closed"`. Row actions `"Edit"`, `"Close"`/`"Reopen"`, `"Delete"`.

#### Tab — Categories (`/categories`)

[components/master/CategoriesPanel.js](erp-frontend/src/components/master/CategoriesPanel.js).

- Panel heading `"Categories"`, search placeholder over name/description, button `"+ Add Category"`.
- Form `"New Category"` / `"Edit Category"`: `"Name"` (required), `"Code"` (maxLength 8, forced UPPERCASE `[A-Z0-9]`, mono, placeholder `"e.g. COOLER, FAN, STAND"`, tooltip about `LOCAL-{code}-{year}-{seq}` serials), `"Parent Category"` (`"— Top Level —"`, options indented with `"› "` prefix; the dropdown excludes self + descendants to block cycles), `"Active"`, `"Description"` (textarea).
- Delete confirm: `"Delete "{name}"? Sub-categories will be re-parented to root."`.
- When searching, the tree collapses to a flat match list; otherwise a recursive `<CategoryTree>` (rows padded by depth, `"› "` prefix, `"inactive"` badge).

---

### 5.9 Stock hub — `/stock`

Hub title `"Stock"` · subtitle `"On-hand summary, movement history, transfers, and damaged goods."` Tabs: **Summary · Stores · Ledger · Transfers · Damaged**.

#### Tab — Summary (`/stock`)

File [pages/Stock.js](erp-frontend/src/pages/Stock.js).

- Title `"Stock summary"`, subtitle `"On-hand vs minimum per item · low-stock alerts highlighted"`. Toolbar quick search + `<ExportButtons>` (file `stock_summary`) + `"+ Adjust Stock"`.
- Table columns (with header tooltips): `"Item"` · `"SKU"` · `"On Hand"` · `"Reserved"` (amber if >0, _"Promised to pending deliveries / sales orders."_) · `"Available"` (bold, _"onHand − reserved … sellable right now."_) · `"Min Level"` · `"Avg cost"` (mono, _"Weighted-average unit cost (running). Updated by purchases."_) · `"Value"` (mono, _"onHand × avg cost — money locked in inventory."_) · `"Status"` (`"Low"` red when `available < minStockLevel`, else `"OK"` green).

**Manual Stock Adjustment modal** — title `"Manual Stock Adjustment"`. Fields `"Item *"` (`"— Select —"`, hint `"Currently on hand: {onHand}"`), `"Reason *"` (`"— Why is the count changing? —"`, reason determines IN vs OUT direction): `"Loss / stolen / missing"` (OUT), `"Damaged / unsellable"` (OUT), `"Stock count — was over"` (OUT), `"Found / mis-shelved"` (IN), `"Stock count — was under"` (IN), `"Correction (add)"` (IN), `"Correction (remove)"` (OUT); reason hint `"This is a stock OUT|IN movement."`; `"Quantity *"` (min 1), `"Extra note"`. Live preview `"After adjustment: {projected}"` + negative-stock guard. Buttons `"Save Adjustment"` / `"Cancel"`. Validation messages cover missing item / missing reason / qty / negative-stock.

#### Tab — Stores (`/stores`)

`StoresPanel` (`<CrudPage>`) in MasterData.js. Title `"Stores / Branches"`. Form `"Name"` (required), `"Location"`, `"Active"`. Columns `"Name"` · `"Location"` · `"Active"` (`"Yes"`/`"No"`).

#### Tab — Ledger (`/stock-ledger`)

File [pages/StockLedger.js](erp-frontend/src/pages/StockLedger.js). Title `"Stock Ledger"` (`page-header` h2), export file `stock_ledger`, subtitle `"Total IN {x} · Total OUT {y} · Net {z}"`. Filter row `"Item"`/`"Category"`/`"Brand"`/`"Supplier"` (all `"— Any —"`), `"From"`, `"To"`, buttons `"Apply Filters"` / `"Reset"`. Summary stats `.ledger-summary`: Total IN (success) / Total OUT (danger) / Net Change / Movements count. Table `"Date"` · `"Item"` · `"SKU"` · `"Store"` · `"Type"` (IN green / OUT red badge) · `"Qty"` · `"Reference"` · `"Running"`.

#### Tab — Transfers (`/stock-transfers`)

File [pages/StockTransfers.js](erp-frontend/src/pages/StockTransfers.js). Title `"Stock transfers"`, subtitle `"Move inventory between stores. Each transfer is atomic — OUT from source, IN to destination, or nothing."`. Button `"+ New transfer"` (disabled when < 2 stores; warning chip). Form `"From store *"` / `"To store *"` (`"— Select —"`), `"Date"`, item lines (`"Item"` + `"Quantity"` + remove), `"+ Add line"`, `"Notes"`. Validation: from ≠ to, ≥1 valid line. List columns `"Transfer #"` · `"Date"` · `"From"` · `"To"` · `"Items"` · `"Notes"`.

#### Tab — Damaged (`/damaged-goods`)

File [pages/DamagedGoods.js](erp-frontend/src/pages/DamagedGoods.js). Title `"Damaged goods"`, subtitle `"Track stock removed from sellable inventory — damaged, in repair, written off, or restored."`. Button `"+ Report damage"`. A `.grid-stat` of per-status tiles (`"Damaged"` / `"In repair"` / `"Write-off"` / `"Repaired (returned to stock)"`). Form `"Item *"`, `"Store"` (`"— Any —"`), `"Quantity *"`, `"Initial status *"` (only `DAMAGED` / `IN_REPAIR` / `WRITE_OFF` selectable at create), `"Reported on"`, `"Reason"`, `"Notes"`, plus a warning that reporting immediately removes stock. Row actions are status-conditional: `"Send to repair"` (DAMAGED→IN_REPAIR), `"Mark repaired"` + `"Write-off"` (DAMAGED/IN_REPAIR), `"Delete"` (REPAIRED). Columns `"Voucher"` · `"Reported"` · `"Item"` · `"Store"` · `"Qty"` · `"Status"` (chip per status) · `"Reason"` · `"Actions"`.

---

### 5.10 Employee hub — `/employees`

Hub title `"Employees"` · subtitle `"Staff roster, attendance, payments, incentive rules, and ledger."` Tabs: **Info · Attendance · Payments · Incentive Rules · Ledger**.

#### Tab — Info (`/employees`)

`EmployeesPanel` in MasterData.js (loads computed balances from `/reports/employee-balances`).

- Heading `"Employees"`. Buttons `"Run salary accrual"` (POST `/employees/accrue-salaries`, idempotent, alerts the count) + `"+ Add Employee"`. Search over code/name/role/phone/email.
- Form `"New Employee"` / `"Edit Employee"`: `"Code"` (`"Auto-generated if blank"`), `"Name *"`, `"Role"` (`"e.g. Cashier, Salesman"`), `"Phone"`, `"Email"`, `"Monthly salary"`, `"Opening balance"`, `"Joined on"`, `"Salary day of month"` (1–31, hint about auto-accrual), `"Accrue salary for the joining month too (first salary in advance)"` (checkbox), `"Address"`, `"Notes"`, `"Active"`.
- Table: `"Code"` · `"Name"` (+ CLOSED chip if inactive) · `"Role"` · `"Phone"` · `"Salary"` · `"Balance"` (chip `"· we owe"` warn / `"· they owe"` info / `"· settled"`) · `"Status"` · `"Actions"` (Ledger / Edit / Close-Reopen / Delete).

#### Tab — Attendance (`/attendance`)

File [pages/Attendance.js](erp-frontend/src/pages/Attendance.js). Title `"Attendance · {date}"`. Date input + `"Refresh"`. Tally chips `"✓ Present"` (success), `"½ Half day"` (warn), `"○ Leave"` (info), `"✕ Absent"` (danger). Table `"Employee"` · `"Role"` · `"Current status"` (chip or `"— not marked —"`) · `"Mark"` (four buttons; current highlighted). Only active employees listed. Empty `"No active employees yet. Add employees first under Catalogue → Employees."`.

#### Tab — Payments (`/employee-payments`)

File [pages/EmployeePayments.js](erp-frontend/src/pages/EmployeePayments.js). Title `"Employee payments"`, subtitle `"Salary, advances, reimbursements, expenses, incentive payouts."`. Export file `employee_payments`. Button `"+ New entry"`. Form `"New employee transaction"`: `"Employee *"`, `"Type *"` (`"Salary"`, `"Advance (employee borrows)"`, `"Reimbursement (employee paid expense)"`, `"Shop expense paid by employee"`, `"Incentive payout"`, `"Adjustment"`), `"Date *"`, `"Amount *"`, `"Account (for cash/bank flow)"` (`"— None / out-of-pocket —"`), `"Description"`, `"Notes"`. Columns `"Date"` · `"Voucher"` · `"Employee"` · `"Type"` (chip) · `"Description"` · `"Account"` · `"Amount"` · `"Actions"` (Delete).

#### Tab — Incentive Rules (`/employee-incentive-rules`)

File [pages/EmployeeIncentiveRules.js](erp-frontend/src/pages/EmployeeIncentiveRules.js). Title `"Employee incentive rules"`, subtitle about stacking. Button `"+ New rule"`. Form: `"Employee *"`, `"Applies to *"` (`"All sales"` / `"Sales of a category"` / `"Sales of a specific item"` / `"Sales of a brand"`), conditional `"Category *"` / `"Item *"` / `"Brand *"`, `"Percentage of sale *"` (max 100), `"Starts on"`, `"Ends on"`, `"Notes"`, `"Active"`. Columns `"Employee"` · `"Applies to"` · `"Reference"` · `"Percentage"` · `"Period"` (`"{startsOn} → {endsOn}"` or `"always"`) · `"Status"` · `"Actions"`. Confirm delete `"Delete this rule?"`.

#### Tab — Ledger (`/employee-ledger`, `/employee-ledger/:id`)

File [pages/EmployeeLedger.js](erp-frontend/src/pages/EmployeeLedger.js). Has its own inline table (debit/credit relabeled `"Earned"`/`"Paid"`) — does **not** use `<LedgerView>`. Title `"Employee ledger"`. Picker `"— Select employee —"` (`"{name} · {role}"`), `"From"`/`"To"` dates. Summary stripe `"Opening balance"`, `"Incentives earned · this period"` (gradient text), `"Current balance · {status}"` (`"we owe employee"` / `"employee owes us"` / `"settled"`). Table `"Date"` · `"Ref"` · `"Type"` · `"Description"` · `"Earned"` · `"Paid"` · `"Balance"`. `<ExportButtons>` (file `employee_ledger_{name}`).

---

### 5.11 Account hub — `/accounts`

Hub title `"Accounts"` · subtitle `"Cash, bank, wallet, capital, and credit accounts plus transfers."` Tabs: **Info · Transfers · Ledger**.

#### Tab — Info (`/accounts`)

`AccountsPanel` (`<CrudPage>`) in MasterData.js. Title `"Accounts (Cash / Bank / Wallet / Capital / Credit)"`. Form `"Code"` (`"Auto-generated if blank (e.g. ACC-000001)"`), `"Name *"`, `"Type *"` (select; only the five user flavours are creatable: `"Cash (physical till)"`, `"Bank account"`, `"Mobile wallet (Easypaisa, JazzCash…)"`, `"Owner Capital / Equity"`, `"Credit card / Credit line"`), `"Bank Name"`, `"Account #"`, `"Opening Balance"`, `"Active"`. Columns `"Code"` · `"Name"` · `"Type"` · `"Bank"` · `"Account #"` · `"Opening"` (right) + Actions (Ledger / Edit / Close-Reopen / Delete). System accounts can't be deleted (rename only).

#### Tab — Transfers (`/fund-transfers`)

File [pages/FundTransfers.js](erp-frontend/src/pages/FundTransfers.js). Heading `"Fund Transfers"`, button `"+ New Transfer"`. Info: `"Move money between your own accounts (Capital → Cash, Cash → Bank, Bank → Credit Card, etc.). Customer/supplier payments belong on the Receipts / Payments pages."`. Form `"Date"`, `"From Account"` / `"To Account"`, `"Amount"`, `"Notes"`. Validation `"Source and destination must differ"`. Columns `"Transfer #"` · `"Date"` · `"From"` (name + type) · `"To"` · `"Amount"` · `"Notes"` · `"Actions"` (`<ReverseAction endpoint="/fund-transfers">`).

#### Tab — Ledger (`/account-ledger`, `/account-ledger/:id`)

File [pages/AccountLedger.js](erp-frontend/src/pages/AccountLedger.js). Picker `"— Select account —"` grouped by type (`<optgroup>` CASH / BANK / WALLET / CAPITAL / CREDIT), option `"{name} ({balance})"`. Card shows name + type badge + bank/account-number lines. Body `<LedgerView>`. Empty `"All Bank, Wallet, Cash, Capital and Credit accounts are listed."`.

---

### 5.12 Users hub — `/users-change-password` (everyone) / `/users` (admins)

Hub title `"Users"` · subtitle `"User accounts, access requests, sign-in history, and passwords."` The sidebar lands on Change Password (the only tab a regular user sees). Tabs:

| Tab | Route | Role |
|---|---|---|
| `"Info"` | `/users` | superuser only |
| `"Allow Access"` | `/users-allow-access` | superuser only |
| `"Recent Login"` | `/users-recent-login` | superuser only |
| `"Change Password"` | `/users-change-password` | everyone |

Superuser routes are wrapped in `<RequireSuperuser>` (the only client-side RBAC; the backend re-enforces). A non-superuser hitting one is redirected to `/users-change-password` (or `/backup`).

#### Tab — Info (superuser) — [pages/users/UsersInfo.js](erp-frontend/src/pages/users/UsersInfo.js)

- Heading `"Users"`, button `"+ Add user"`.
- **Create user modal** `"Create user"`: `"Username *"` (minLength 2), `"Password *"` (minLength 6), `"Full name"`, `"Role"` (`"USER (regular)"` / `"SUPERUSER (admin)"`).
- Table: `"Username"` (`"(you)"` on your row) · `"Full name"` · `"Role"` (`"SUPERUSER"` green / `"USER"` gray) · `"Status"` (`"Active"` green / `"Disabled"` red) · `"Last login"` · `"Created"` · `"Actions"` (`"Disable"`/`"Enable"`, `"Delete"` — both disabled on your own row).

#### Tab — Allow Access (superuser) — [pages/users/UsersAllowAccess.js](erp-frontend/src/pages/users/UsersAllowAccess.js)

- Heading `"Access requests"`. Status filter `"Pending"` / `"Approved"` / `"Rejected"`.
- **Approve modal** `"Approve {fullName}'s access request"` — fields `"Username *"`, `"Initial password *"`, `"Full name"`; body notes the user is created as a regular USER. Button `"Approve & create user"`.
- Table `"Submitted"` · `"Requested username"` · `"Full name"` · `"Contact"` · `"Reason"` · `"Status"` (PENDING gray / APPROVED green / REJECTED red) · `"Actions"` (Approve/Reject for PENDING, Delete otherwise).

#### Tab — Recent Login (superuser) — [pages/users/UsersRecentLogin.js](erp-frontend/src/pages/users/UsersRecentLogin.js)

Heading `"Recent logins"`, button `"Refresh"`. Loads `GET /users/login-events?limit=200` then fire-and-forget `POST /users/login-events/mark-seen`. Columns `"When"` · `"Username"` (green `"new"` badge while unseen) · `"IP"` · `"User agent"`. Empty `"No logins recorded yet."`.

#### Tab — Change Password (everyone) — [pages/users/UsersChangePassword.js](erp-frontend/src/pages/users/UsersChangePassword.js)

- **My password card** `"My password — {username}"`: `"Current password"`, `"New password"` (≥6), `"Confirm new password"`. Errors `"New password must be at least 6 characters."`, `"New password and confirmation do not match."`. Success `"Password changed. Please sign in again with the new password."` (changing your own password rotates the session token → forced re-login). Button `"Save new password"`.
- **Admin reset card (superuser only)** `"Reset another user's password"`: `"User *"` (`"— pick a user —"`, label `"{username} ({fullName}) · admin|disabled"`, your own row excluded), `"New password *"`, `"Confirm new password *"`. Success `"Password updated…"` (signs that user out everywhere). Button `"Reset password"`.

---

### 5.13 Reports — `/financials`

File [pages/Financials.js](erp-frontend/src/pages/Financials.js). Single route, no HubFrame strip.

- Title `"Financial statements"`. Subtitle: Balance Sheet → `"As of {asOf} · incentives applied to adjusted net income"`; others → `"{from} → {to} · incentives applied to adjusted net income"`.
- Date inputs (Balance Sheet shows a single `asOf`; others show `from`+`to`) + button `"Apply"` (busy → `"Loading…"`). `<ExportButtons>` (file `financials_{tab}`).
- Tab strip (`report-tabs`):

| Tab | Key | Endpoint |
|---|---|---|
| `"Income Statement"` | `income` | `/reports/income-statement` |
| `"Balance Sheet"` | `balance` | `/reports/balance-sheet` |
| `"Cash Flow"` | `cash` | `/reports/cash-flow` |
| `"Changes in Equity"` | `equity` | `/reports/equity-changes` |
| `"Margin Insights"` | `margins` | `/reports/margin-analytics` |

Statement tabs render a `.card.stmt` of rows: `.stmt-row.group` (section heading), `.stmt-row.sub` (line item), `.stmt-row.sum` (subtotal), `.stmt-row.final` (grand total).

- **Income Statement**: group `"Revenue"` (`"Gross sales"`, `"Less: discounts"`, `"Less: sales returns"`, sum `"Net revenue"`); group `"Cost of goods sold"` (`"COGS at cost"`, `"Returns at cost"`, sum `"Gross profit"`); group `"Operating expenses"` (`"Employee incentives (per sale × rule)"`, `"Other expenses"`, sum `"Net income (trading)"`); group `"Incentives"` (`"Awards received in period"`, final `"Adjusted net income"`).
- **Balance Sheet** (`.grid-2`): group `"Assets"` (`"Cash on hand"`, `"Bank balances"`, `"Wallet"`, `"Inventory at cost"`, `"Accounts receivable"`); group `"Liabilities"` (`"Accounts payable"`, `"Credit payable"`); group `"Equity"` (`"Owner capital contributed"`, `"Retained earnings"`).
- **Cash Flow**: group `"Operating activities"` (`"Cash receipts from customers"`, `"Cash sales"`, `"Cash paid to suppliers"`, `"Cash paid for purchases"`, sum `"Net operating cash"`); group `"Summary"` (`"Beginning cash"`, `"Net change in cash"`, final `"Ending cash"`).
- **Changes in Equity**: `"Opening equity"`, `"(+) Net income for period"`, conditional `"(+) Incentive awards"`, `"(−) Drawings"`, final `"Closing equity"`; group `"Reconciliation"` (`"Expected (Opening + Net Income)"`, `"Actual closing"`, `"Difference"`).
- **Margin Insights** — three `HorizontalBars` cards: `"Margin by brand"` (marginPct, success), `"Margin leakage"` (lowest-margin lines `itemName · invoiceNo`, danger), `"High-discount sales"` (`customerName · invoiceNo`, discountPct, warning).

CSV/PDF exports use a flattened `{label, value}` list with slightly different labels than the on-screen UI (e.g. CSV writes `"Gross Revenue"` where the screen shows `"Gross sales"`). Margins are not flattened into the export.

---

### 5.14 System hub — `/backup` (default)

Hub title `"System"` · subtitle `"Backups, audit trail, and runtime error log."` Tabs: **Backups · Audit · Errors** (Audit + Errors are superuser-only).

#### Tab — Backups (`/backup`)

File [pages/Backup.js](erp-frontend/src/pages/Backup.js).

- Heading `"Backups"`. Buttons `"⬇ Download snapshot"` (in-memory snapshot blob download, no server-side row; routed through an authed axios blob fetch + synthetic anchor since a raw GET would lack the auth header) and `"💾 Save backup now"` (POST `/backup`).
- Overdue warning when applicable, naming the scheduled hour.
- **Status card** `"Status"`: `"Last backup"` (datetime or `"Never"`); `"Today's backup"` (`"Done"` green / `"Pending"` red); `"Saved on"` (mono path).
- **Schedule card** `"Schedule"`: field `"Daily backup hour (0–23)"` (default 20), button `"Save schedule"`.
- **Restore card** `"🔥 Restore from backup"` (red-bordered, `--danger-fg` title) with a destructive-warning alert (wipes business tables, replays the snapshot, auto-saves a **Pre-restore safety snapshot**, keeps the Backups history). Fields `"Backup file (.json)"` (file picker, parsed client-side; requires `parsed.data`), `"Type RESTORE to confirm"`, `"Your account password"`. Button `"Restore now"`. Success line reports rows/tables restored + the pre-restore snapshot filename.
- **History section** `"History"`: columns `"Created"` · `"File"` · `"Source"` (`"AUTO"` gray / `"MANUAL"` green) · `"Size"` · `"Notes"` · `"Actions"` (Download / Delete, confirm `"Delete backup {fileName}? This removes the file from disk."`). Per-row Verify re-hashes the file (SHA-256).

#### Tab — Audit (`/audit-log`, superuser) — [pages/AuditLog.js](erp-frontend/src/pages/AuditLog.js)

Heading `"Audit log"`. Buttons `"Refresh"` + `<ExportButtons>` (file `audit_log`). Filters `"Entity type"` (`"All"` + dynamic), `"Action"` (`"All"`/`"CREATE"`/`"UPDATE"`/`"DELETE"`), `"From"`, `"To"`, `"Limit"` (default 500, 50–5000 step 50), plus a client-side quick search. (A `_ts` query param defeats the axios request-dedup cache so Refresh always re-fetches.) Table `"When"` · `"Action"` (badge CREATE green / UPDATE blue / DELETE red) · `"Entity"` · `"Summary"` · `"Source"` · `"Changes"` (collapsible JSON `<details>`).

#### Tab — Errors (`/error-log`, superuser) — [pages/ErrorLog.js](erp-frontend/src/pages/ErrorLog.js)

Heading `"Errors & exceptions"`. Buttons `"Refresh"`, `"Clear all"` (DELETE `/error-logs`, confirm `"Wipe the error log? This cannot be undone."`), `<ExportButtons>` (file `error_log`). Filters `"Level"` (`"All"`/`"ERROR"`/`"WARN"`), `"Source"`, `"From"`, `"To"`, `"Limit"`, quick search. Table `"When"` · `"Level"` (ERROR red / WARN yellow) · `"Status"` · `"Method"` · `"Path"` · `"Message"` · `"Source"` · `"Detail"` (collapsible stack + context). Empty `"No errors logged. Nice."`.

---

## 6. Cross-cutting components

### 6.1 ExportButtons

File [components/ExportButtons.js](erp-frontend/src/components/ExportButtons.js). Props `{ filename, title, subtitle?, columns, rows, footer?, disabled?, size='sm' }`.

| Button | Text | Title |
|---|---|---|
| CSV | `"CSV"` | `"Download as CSV (opens in Excel / Google Sheets)"` |
| PDF | `"PDF"` | `"Open print view — choose 'Save as PDF' as the destination"` |

Both disabled when `disabled || empty`. CSV is built client-side with a UTF-8 BOM (so Excel detects encoding) via [utils/exporters.js](erp-frontend/src/utils/exporters.js); booleans render `"Yes"`/`"No"`. PDF opens a print-friendly tab (system letterhead + timestamp) and auto-runs `window.print()` so the user picks "Save as PDF" (no backend PDF library). Columns are `{ key, label, value?: row=>…, align? }`.

### 6.2 CrudPage scaffold

File [components/CrudPage.js](erp-frontend/src/components/CrudPage.js). Generic master-data scaffold used by Brands, Stores, Accounts. Field types `text` / `number` / `email` / `checkbox` / `textarea` / `select`. Required fields suffixed ` *`. Select placeholders `"— Select —"` / `"— None —"`. Standard error `"Save failed"`. Delete confirm `Delete "{row.name ?? row.id}"?`. States `"Loading…"`, `"No records yet."` / `"No matches."`. Submit button `"Create"` / `"Update"`.

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

Constant strings: `"Account *"`, `"Amount *"`, `"Notes"`, `"Save Voucher"`, `"Cancel"`, columns `"Voucher #"` / `"Date"` / party / `"Account"` / `"Amount"` / `"Notes"`, `"No vouchers yet."`, `"Loading…"`. Each row carries a `<ReverseAction endpoint="/payments">`.

### 6.4 Alerts

| Class | Source |
|---|---|
| `.alert.alert-error` | `err.uiMessage` from the API or a fallback (`"Save failed"`, `"Sign-in failed"`, `"Could not change password"`, …) |
| `.alert.alert-success` | confirmation (e.g. `"Password changed. Please sign in again with the new password."`) |
| `.alert.alert-info` | persistent guidance banners (Sales History, Purchases, Overdue Bookings) |

Visual: 8 px padding, 13 px font, transparent border with a 3 px left strip (`--danger` / `--success` / `--info`).

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

Backdrop `rgba(0,0,0,0.45)` light / `rgba(0,0,0,0.6)` dark, z-index 100, **no blur**. Modal `min(520px, 92vw)`, `--surface` bg, 1 px `--border-strong`, 20 px padding, `--shadow-lg`, radius 0. Backdrop click closes only when not busy.

### 6.6 window.confirm uses

| Caller | Text |
|---|---|
| CrudPage | `Delete "{name ?? id}"?` |
| Categories | `Delete "{name}"? Sub-categories will be re-parented to root.` |
| Backup history | `Delete backup {fileName}? This removes the file from disk.` |
| Error log | `Wipe the error log? This cannot be undone.` |
| PO status | `Mark PO {poNo} as {status}?` / `Delete PO {poNo}? This can't be undone.` |
| Employee / party | `Delete {name}?` / `Close|Reopen {name}?` |
| Incentive rule | `Delete this rule?` |
| Damaged goods | per status-transition confirm |

### 6.7 GlobalSearch

File [components/GlobalSearch.js](erp-frontend/src/components/GlobalSearch.js). Topbar omnibox; lazy-loads `/customers`, `/suppliers`, `/employees`, `/accounts`, `/items` on first focus. Result kinds + destinations: Customer → `/customer-ledger/:id`, Supplier → `/supplier-ledger/:id`, Employee → `/employee-ledger/:id`, Account → `/account-ledger/:id`, Item → `/items` (tile, not a per-item page). Placeholder `"Search by code, name, phone, SKU…"`. Popover states `"Loading…"`, `"No matches."`, max 8 hits. Auto-generated codes (CUST-/SUPP-/EMP-/ACC-) make code search reliable.

### 6.8 LedgerView, AgingPanel, ReverseAction (shared)

- **`<LedgerView title party ledger>`** ([components/LedgerView.js](erp-frontend/src/components/LedgerView.js)) — read-only running-balance renderer used by Customer / Supplier / Account ledgers. A `panel-stripe` of Opening balance + Current balance (tone label `"owes you"` / `"in credit"` / `"settled"` for AR-style; supplier/account vary). Table `"Date"` · `"Ref #"` · `"Type"` (chip) · `"Description"` · `"Debit"` · `"Credit"` (green) · `"Balance"`. Has its own `<ExportButtons>`. Empty `"No transactions yet."`.
- **`<AgingPanel title lines numKey showPromiseColumn?>`** ([components/AgingPanel.js](erp-frontend/src/components/AgingPanel.js)) — per-document aging detail above a ledger. Columns: invoice/bill number (mono) · Date · Net · Residual (mono bold) · `"Days Elapsed"` (color-graded: ≥30 danger, ≥15 warning, else muted) · and (AR only, `showPromiseColumn`) a `"Past Promise"` column: `chip-danger "Nd"` when a promise lapsed, `chip-info "promised"` when a future promise exists, else `"—"`.
- **`<ReverseAction endpoint row label onDone>`** ([components/ReverseAction.js](erp-frontend/src/components/ReverseAction.js)) — row-level reversal for `/sales` | `/purchases` | `/payments` | `/fund-transfers`. Already-reversed rows render a `chip-warn "Reversed"` (title = reason). Otherwise a `btn-warn "Reverse"` opens a modal requiring a non-empty reason (`"A reason is required."`), explaining the balancing entry / Reversed chip / netting / idempotency, then `POST {endpoint}/:id/reverse {reason}` and calls `onDone()` (reload).

### 6.9 MiniCharts

File [components/MiniCharts.js](erp-frontend/src/components/MiniCharts.js) — hand-rolled inline SVG (no chart library, flat Win10 look). Exports: `StackedBar` (AR/AP aging proportions; empty → `"Nothing outstanding."`), `Donut` (Cash Trap inventory aging share; empty → dashed circle), `Bullet` (incentive progress vs target + threshold marker), `HorizontalBars` (margin insights ranking; empty → `"No data in this period."`), `FunnelStages` (delivery / service pipelines as honest stacked bars; empty → `"No active tickets in the pipeline."`), `MiniLine` (cash-register variance line with zero baseline).

---

## 7. Print pages (HTML, no thermal driver)

Top-level routes **outside** the Layout (no auth gate), each fetches on mount and auto-triggers `window.print()` ~250 ms after data resolves, so opening the URL in a new tab is a single-click print. Print theme is hard-light regardless of app theme; `@media print` hides `.sidebar`, `.no-print`, and `.page-header button`, and forces `color:#111827` on all print-page descendants. **No thermal/ESC-POS driver** — everything is HTML + `@page` CSS scaled by the browser; the serial-label barcode is a fake bar pattern (no jsbarcode yet).

### 7.1 Invoice print — `/print/sale/:id`, `/print/purchase/:id`

File [pages/InvoicePrint.js](erp-frontend/src/pages/InvoicePrint.js). Used for both sales (`type="sale"`) and purchases. Sale-only second fetch of serials by `saleInvoiceNo`.

- Top `.booking-banner` only when `data.dueAmount > 0.005` on a sale: `"BALANCE PENDING — DO NOT RELEASE GOODS UNTIL FINAL PAYMENT"`.
- Title `"SALES INVOICE"` / `"SALES INVOICE · BOOKING HOLD"` / `"PURCHASE BILL"`.
- Lines: `#` · Item (name + sku) · Qty · Unit Price · Line Total. Sale lines carry a per-line `<LineWarrantyNotice>` (4 variants: `"NO WARRANTY COVERAGE / SOLD AS-IS"`, `"No warranty. Item checked at time of sale."` (CHECKING_ONLY), `"No Warranty"` (NONE), `"Warranty: <type> · <days> days"` + per-serial expiry list for COMPANY/SHOP).
- Totals block; sale-only `"Warranty Terms & Conditions"` `<ol>` when any line carries real cover.

### 7.2 Booking receipt — `/print/booking-receipt/:id`

File [pages/BookingReceiptPrint.js](erp-frontend/src/pages/BookingReceiptPrint.js). Heavy red banner `"⚠ BOOKING HOLD — BALANCE PENDING ⚠ / DO NOT ALLOW OUT OF THE SHOP UNTIL FINAL PAYMENT"`. Title `"BOOKING RECEIPT"`. Per-line table with a `"Serial(s)"` (mono) column. Totals with the `"BALANCE PENDING"` row in `#c50f1f`. Payment-schedule table (`"Due Date"` / `"Expected"` / `"Paid"` / `"Status"`) when commitments exist. Two signature lines (`"Customer signature"`, `"Cashier signature"`). Footer instructs the customer to bring the receipt + clear the balance before delivery.

### 7.3 Box hold tag — `/print/box-tag/:id`

File [pages/BoxTagPrint.js](erp-frontend/src/pages/BoxTagPrint.js). 4"×6" landscape (`@page { size: 6in 4in landscape; margin: 0 }`). 4 px red border + rotated `"DO NOT SELL"` watermark at 8% opacity. Header `"⚠ RESERVED ITEM — DO NOT SELL ⚠"` (red 18 pt). 2-column grid: Customer (large bold), Phone, Invoice #, Booked, Hold until, Balance due (red 18 pt). Per-serial `model · serial` rows (mono). Footer `"TAPE THIS SLIP DIRECTLY TO THE BOX · CHECK WITH OFFICE BEFORE SELLING ANY UNIT WITH A TAG"`.

### 7.4 Serial label — `/print/serial-label/:serial`

File [pages/SerialLabelPrint.js](erp-frontend/src/pages/SerialLabelPrint.js). 2"×1" thermal-sticker (`@page { size: 2in 1in; margin: 0 }`). Stack: shop branding (`"HASSAN ELECTRONICS"`) → fake barcode bars synthesized from the serial chars → mono serial text → item model. Fetches `GET /item-serials/warranty/<serial>`.

---

## 8. Electron shell

The renderer runs inside an Electron 40 wrapper ([erp-desktop/src/main.js](erp-desktop/src/main.js) — source of truth). Notable native chrome:

- **Custom `app://` protocol** — renderer loaded as `app://localhost/index.html` (registered privileged: standard/secure/supportFetchAPI/stream). Loading via `file://` is forbidden (it makes `location.origin === "null"`, breaking React Router 7 / axios `new URL(...)`).
- **Title-bar overlay** — `titleBarStyle: 'hidden'` + `titleBarOverlay` paints the Windows min/max/close controls on the right at 44 px tall. Colors: light `{ color: '#fafafa', symbolColor: '#1f1f1f' }`, dark `{ color: '#333333', symbolColor: '#f5f5f5' }` (must match `--surface-elev`). The in-app `.topbar` is the drag region; flipped via `window.erpBridge.setTitleBarTheme(theme)` IPC. Renderer is sandboxed (`sandbox: true`, `contextIsolation: true`).
- **Native menu killed** — `Menu.setApplicationMenu(null)`. No File/Edit/View bar.
- **Splash window during backend boot** — frameless 420×220 dialog with a `"Hassan Electronics ERP"` heading, dynamic message (`"Starting backend…"` → `"Loading interface…"`), an indeterminate progress bar, footer `"First launch may take up to a minute."`.
- **Backend-ready timeout** — 300 s (5 min), polling `http://127.0.0.1:3001/api/health` every 500 ms; failure shows a `"Startup error"` dialog citing `backend.log`.
- **Backend crash** — `"Backend stopped"` dialog (code + log path). **Build-missing dialogs** — `"Backend build missing"` / `"Frontend build missing"`.
- The child backend gets `PORT`, `SQLITE_PATH`, `BACKUP_DIR`, `DB_MIGRATE_ON_BOOT='true'`, `ELECTRON_RUN_AS_NODE='1'`, and (from `<userData>/config.json` or env) optional `CLOUD_SYNC_URL` / `DATABASE_URL`. Data lives under `%APPDATA%\Hassan Electronics` (`erp.sqlite`, `backups/`, `config.json`, `backend.log`).

---

## 9. File-to-page map

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
| LedgerView (shared) | [components/LedgerView.js](erp-frontend/src/components/LedgerView.js) |
| AgingPanel (shared) | [components/AgingPanel.js](erp-frontend/src/components/AgingPanel.js) |
| ReverseAction (shared) | [components/ReverseAction.js](erp-frontend/src/components/ReverseAction.js) |
| MiniCharts (shared) | [components/MiniCharts.js](erp-frontend/src/components/MiniCharts.js) |
| Items panel | [components/master/ItemsPanel.js](erp-frontend/src/components/master/ItemsPanel.js) |
| Categories panel | [components/master/CategoriesPanel.js](erp-frontend/src/components/master/CategoriesPanel.js) |
| Login / Request access | [pages/Login.js](erp-frontend/src/pages/Login.js) |
| Dashboard | [pages/Dashboard.js](erp-frontend/src/pages/Dashboard.js) |
| POS Terminal | [pages/POS.js](erp-frontend/src/pages/POS.js) |
| Cash Book | [pages/CashRegister.js](erp-frontend/src/pages/CashRegister.js) |
| Master Data (Customer / Supplier / Brands / Stores / Accounts / Employees panels) | [pages/MasterData.js](erp-frontend/src/pages/MasterData.js) |
| Sales Voucher | [pages/SalesVoucher.js](erp-frontend/src/pages/SalesVoucher.js) |
| Sales History | [pages/Sales.js](erp-frontend/src/pages/Sales.js) |
| Sale Returns | [pages/SaleReturns.js](erp-frontend/src/pages/SaleReturns.js) |
| Deliveries | [pages/Deliveries.js](erp-frontend/src/pages/Deliveries.js) |
| Overdue Bookings | [pages/OverdueBookings.js](erp-frontend/src/pages/OverdueBookings.js) |
| Service Tickets | [pages/ServiceTickets.js](erp-frontend/src/pages/ServiceTickets.js) |
| Warranty Lookup | [pages/WarrantyLookup.js](erp-frontend/src/pages/WarrantyLookup.js) |
| Transactions hub landing | [pages/Transactions.js](erp-frontend/src/pages/Transactions.js) |
| Invoice print | [pages/InvoicePrint.js](erp-frontend/src/pages/InvoicePrint.js) |
| Booking Receipt print | [pages/BookingReceiptPrint.js](erp-frontend/src/pages/BookingReceiptPrint.js) |
| Box Tag print | [pages/BoxTagPrint.js](erp-frontend/src/pages/BoxTagPrint.js) |
| Serial Label print | [pages/SerialLabelPrint.js](erp-frontend/src/pages/SerialLabelPrint.js) |
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
| Auth context / superuser guard | [auth/AuthContext.js](erp-frontend/src/auth/AuthContext.js), [auth/RequireSuperuser.js](erp-frontend/src/auth/RequireSuperuser.js) |
| API client | [api/client.js](erp-frontend/src/api/client.js) |
| Tokens / theme | [styles/tokens.css](erp-frontend/src/styles/tokens.css), [styles/app.css](erp-frontend/src/styles/app.css), [App.css](erp-frontend/src/App.css), [theme/ThemeContext.js](erp-frontend/src/theme/ThemeContext.js), [public/theme-bootstrap.js](erp-frontend/public/theme-bootstrap.js) |
| Hubs / Sidebar | [nav/hubs.js](erp-frontend/src/nav/hubs.js) |
| Electron shell | [erp-desktop/src/main.js](erp-desktop/src/main.js) |
