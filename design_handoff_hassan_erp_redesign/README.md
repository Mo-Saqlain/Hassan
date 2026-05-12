# Handoff: Hassan Electronics — ERP Redesign

## Overview

A full visual redesign of the Hassan Electronics ERP/POS — a single-store retail
ERP for home appliances. The redesign keeps the existing information
architecture (sidebar nav, all the same screens) but applies a modern fintech
aesthetic (Linear / Mercury-style) with an aurora-glass surface, a violet→cyan
gradient brand mark, dark + light themes, a Tweaks panel for live customization,
and a responsive mobile layout.

The existing codebase is a NestJS backend + Electron-wrapped React frontend
(offline-first, Postgres on cloud, SQLite on cashier PC). This handoff replaces
the **frontend styling and shell** only — backend APIs, data models, and
business logic are untouched.

## About the design files

The files in this bundle are **design references created in plain HTML + a few
JSX scripts loaded via Babel-in-browser**. They are prototypes showing intended
look, layout, and a slice of behavior — they are *not* production code.

Your task is to **recreate these designs inside the existing
`erp-frontend/` React app**, using its established patterns (component
structure, routing via `HashRouter`, `ThemeContext`, axios services, etc).
Don't `<script src>` the Babel CDN; convert the JSX scripts into real
React components compiled by the app's Vite/CRA toolchain.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, radii, shadows, hover
states, and layout proportions are all locked. Recreate pixel-faithfully.

The two CSS files (`tokens.css`, `app.css`) are **drop-in** — they hold every
token and utility class the redesign needs and can be pasted into
`erp-frontend/src/styles/` and `@import`ed from `src/index.css`.

---

## What changed vs the old UI

| Area | Before | After |
|---|---|---|
| Palette | Flat dark + neutrals | Aurora gradients (violet, cyan, pink) on glass surfaces |
| Brand | "Hassan Electronics" wordmark + lightning bolt | Same wordmark; new gradient bolt mark (violet → cyan) |
| Sidebar nav label | "Master Data" | **"Catalogue"** |
| Dashboard | Had a "New sale" CTA in the topbar | **Removed** — POS tab is the entry point |
| POS scan input | "Scan barcode or type SKU / model no." | "Type model no. — e.g. DAWLANCE LVS-15" (barcode removed) |
| Items table | Showed Model No. + SKU subline | Model No. only (no SKU, no barcode column) |
| Theme | Light + dark | Light + dark (kept) — now with aurora backdrop in both |
| Tweaks | none | Floating Tweaks panel — accent palette, radius, glass strength, aurora strength |
| Mobile | Sidebar collapse only | Full off-canvas drawer + responsive grids ≤ 860px |

The user explicitly asked for: removal of barcode references (they don't store
barcodes — model no. is the identifier), removal of the dashboard "New sale"
button, renaming "Master Data" → "Catalogue", and a mobile-friendly layout.

---

## Screens / views

All screens live inside the app shell: **sidebar (left, 264px) + topbar (sticky,
60px) + content area**. Each screen has a `.page-head` (h1 + subtitle on the
left, action buttons on the right).

### 1. Dashboard
- **Purpose:** at-a-glance KPIs, latest activity, low-stock alerts.
- **Layout:** 4-up stat row → 2-col grid (revenue chart + activity feed) → 2-col grid (low stock + top customers).
- **Stat cards** (4): each has an icon chip (top-right), label, big value, and a delta chip (positive/negative). Hover lifts 2px. Background is `.card` (glass). The decorative orb sits at `z-index: 0` behind text content (`z-index: 1`).
- **Revenue chart card:** SVG line + area fill in violet→cyan gradient with dotted grid.
- **Latest activity:** vertical list of rows, each with a colored icon chip (sale=green, purchase=violet, payment=cyan, return=pink), title, subtitle, amount, time. Rows use `border-bottom: 1px dashed var(--border)`; last row's border removed.
- **Low stock card:** rows showing model no., brand, current stock vs. min (with red chip if below).

### 2. POS terminal
- **Purpose:** ring up a sale.
- **Layout:** 2-col grid — left: product search + cart (flex column, `min-height: calc(100vh - 60px - 56px)`); right: customer + totals + pay buttons (sticky panel).
- **Search input:** large 46px input with bolt icon prefix, placeholder "Type model no. — e.g. DAWLANCE LVS-15".
- **Cart rows:** model + meta (brand · category) | unit price | qty +/− stepper | line total | remove button. Borders use dashed style.
- **Totals stripe:** 3-col mini-grid (Subtotal / Discount / Total) with `border-right` separators (drops to stacked rows ≤ 860px).
- **Payment method grid:** 4 buttons (Cash / Card / Bank / Wallet) in `.pay-method-grid` — drops to 2-col ≤ 860px.

### 3. Catalogue (formerly "Master Data")
- **Purpose:** hub for items, categories, brands, customers, suppliers, stores, accounts.
- **Layout:** 3-col grid of `.tile` cards, each tile = colored icon badge + title + 1-line desc + count line. Hover lifts and brightens.
- **Tiles + colors:**
  - Items — `#a78bfa` violet — "Model no., brand, categories, pricing."
  - Categories — `#c084fc` light violet
  - Brands — `#f472b6` pink
  - Customers — `#22d3ee` cyan
  - Suppliers — `#fb923c` orange
  - Stores — `#34d399` green
  - Accounts — `#fbbf24` amber

### 4. Transactions hub
- **Layout:** 4 groups (Sales / Purchases / Money / Treasury), each a row of colored tiles. Tile spec same as Catalogue.

### 5. Sales (history list)
- Sortable/filterable table: Date · Voucher · Customer · Items · Subtotal · Discount · Paid · Total · Status chip.
- Status chips: `chip-success` (paid), `chip-warn` (partial), `chip-danger` (unpaid).
- Filters above: date range, store, payment status, search.

### 6. Customer / Supplier ledger
- **Layout:** `.session-bar` header (customer picker + date range + opening balance + closing balance), then full-width transactions table (Date · Ref · Type · Description · Debit · Credit · Balance).
- Closing balance footer row in monospace.

### 7. Cash book
- Date selector at top, two-column "Cash in" / "Cash out" running list, balance summary footer.

### 8. Financial statements
- Tabs: Balance sheet · Income statement · Cash flow.
- Each statement is a stack of `.stmt-section` blocks; rows have label (left), value (right, monospace, right-aligned). `border-bottom: 1px dashed` between rows; last row has no border. Subtotals bolded, with a top rule.

---

## Design tokens

All in `tokens.css`. Light + dark variants applied via `data-theme="dark|light"`
on `<html>` — the existing `ThemeContext` already does this.

### Colors — brand
```
--violet-400  #a78bfa
--violet-500  #8b5cf6
--violet-600  #7c3aed   ← primary brand
--cyan-400    #22d3ee
--cyan-500    #06b6d4   ← secondary brand
--pink-400    #f472b6
--pink-500    #ec4899
--indigo-500  #6366f1
```

### Colors — gradient (brand mark + primary buttons)
```
--gradient-primary: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%);
--gradient-aurora:  conic-gradient(from 180deg at 50% 50%, #7c3aed, #06b6d4, #ec4899, #7c3aed);
```

### Colors — semantic
| Token | Light | Dark | Use |
|---|---|---|---|
| `--text` | `#0f1226` | `#e7ecff` | body text |
| `--text-muted` | `#5b6280` | `#8b93b8` | secondary |
| `--text-dim` | `#8189a8` | `#5d6488` | tertiary / placeholder |
| `--bg` | `#f4f5fb` | `#07081a` | page background |
| `--bg-elev` | `#ffffff` | `#0c0e22` | sidebar, topbar |
| `--surface` | `rgba(255,255,255, 0.55 + glass*0.20)` | `rgba(20,22,48, glass*0.85)` | cards, tiles |
| `--border` | `rgba(15,18,38,0.08)` | `rgba(255,255,255,0.08)` | hairlines |
| `--success` | `#10b981` | `#10b981` | paid, OK |
| `--warn` | `#f59e0b` | `#f59e0b` | partial, attention |
| `--danger` | `#ef4444` | `#ef4444` | unpaid, error |

### Sidebar nav-icon colors
```
--nav-dashboard #6366f1    --nav-pos       #ec4899
--nav-master    #a78bfa    --nav-tx        #22d3ee
--nav-cash      #14b8a6    --nav-stock     #fb923c
--nav-sales     #f472b6    --nav-purch     #8b5cf6
--nav-cust      #06b6d4    --nav-supp      #10b981
--nav-fin       #facc15
```

### Typography
- **Sans:** `Inter` (existing) — weights 400 / 500 / 600 / 700
- **Mono:** `JetBrains Mono` — used for numbers, SKUs, IDs, voucher refs

Scale (lines are in px):
```
h1  28 / 1.15 / 600 / -0.02em
h2  22 / 1.2  / 600 / -0.01em
h3  17 / 1.3  / 600
body 14 / 1.5 / 400
small 12 / 1.4 / 500 (often --text-muted)
mono numbers   inherit size, family: var(--font-mono)
```

### Spacing
`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56` (px). The Tweaks panel can set `--radius` 6–28px (default 16).

### Radius
```
--radius     16px   (default; tweakable 6–28)
--radius-sm  10px
--radius-lg  20px
--radius-pill 9999px
```

### Shadows
```
--shadow-1  0 1px 2px rgba(15,18,38,0.04), 0 1px 3px rgba(15,18,38,0.06)
--shadow-2  0 4px 12px rgba(15,18,38,0.05), 0 8px 24px rgba(15,18,38,0.06)
--shadow-3  0 10px 30px rgba(15,18,38,0.08), 0 20px 50px rgba(15,18,38,0.08)
--shadow-glow  0 0 0 1px rgba(124,58,237,0.4), 0 8px 28px rgba(124,58,237,0.35)
```

### Glass effect (cards, tiles, sidebar, topbar)
```
background:        var(--surface)
border:            1px solid var(--border)
backdrop-filter:   blur(18px) saturate(180%)
box-shadow:        var(--shadow-2)
border-radius:     var(--radius)
```

### Aurora backdrop (`body::before`)
A `position: fixed` pseudo-element with 4 radial gradients (violet, cyan, pink,
indigo) blurred 48px and masked at the bottom 8% so it never bleeds into the
page footer. Animates over 28s `transform: translate3d() scale()`. Tweakable
strength 0–140% (default 100).

---

## Components / utility classes

All defined in `tokens.css` + `app.css`. Class names match the JSX.

| Class | What |
|---|---|
| `.app` | Top-level grid (`264px 1fr`); flips to single-col on mobile |
| `.sidebar` | Glass sidebar; mobile = fixed off-canvas drawer |
| `.topbar` | Sticky header; includes `.mobile-menu-btn` (visible ≤ 860px) |
| `.card` | Glass card surface |
| `.tile` | Hub tile (icon + title + desc + count) |
| `.btn` `.btn-sm` `.btn-lg` `.btn-primary` `.btn-ghost` `.btn-danger` | Buttons |
| `.input` | Form input |
| `.chip` `.chip-success` `.chip-warn` `.chip-danger` `.chip-info` | Status chips |
| `table.t` | Table; rows hover-tint, last-row borders removed |
| `.grid-stat` `.grid-2` `.grid-3` `.grid-4` | Responsive grids |
| `.pos-grid` | POS 2-col layout |
| `.pos-cart-row` | Cart line item grid |
| `.panel-stripe` | Multi-cell strip with vertical dividers |
| `.session-bar` | Ledger header strip |
| `.stmt-section` `.stmt-row` `.stmt-subtotal` | Financial statement blocks |
| `.brand-mark` | Gradient logo chip (36px) |
| `.scrim` | Mobile drawer backdrop |

### Buttons
- `.btn` — 36px tall, 12px radius, glass surface, `--text` color
- `.btn-primary` — `--gradient-primary` background, white text, `--shadow-glow` on hover
- `.btn-ghost` — transparent background, border only
- `.btn-sm` — 28px tall; `.btn-lg` — 46px tall

### Status chips
Pill-shaped, 22px tall, 11px font, semibold. Tints derived from `--success` / `--warn` / `--danger` / `--cyan-500` at 14% alpha background + 100% colored text.

---

## Interactions & behavior

### Navigation
- Sidebar nav items: click → set active page, show colored icon chip. Active item gets `background: var(--surface-elev); color: var(--text);` and a 2px gradient left bar.
- Mobile: hamburger (`.mobile-menu-btn`) opens `.sidebar` off-canvas via `data-nav="open"` on `.app`. Scrim closes on tap.

### Hash-deep-link
Main HTML reads `location.hash` on init to pick the initial page — used by the mobile preview page to deep-link different phone frames.

### Theme toggle
- Sun/moon button in sidebar footer.
- Sets `data-theme="dark|light"` on `<html>`. Existing `ThemeContext` already handles this — keep it.
- Persists to `localStorage` ("theme" key).

### Tweaks panel
Floating bottom-right toggle. Controls:
- **Accent palette** — 5 curated 2-color combos (violet-cyan default, indigo-pink, teal-cobalt, ember, sea-green)
- **Corner radius** — slider 6–28 px, writes `--radius`
- **Glass strength** — slider 0–100%, writes `--glass-strength`
- **Aurora strength** — slider 0–140%, writes `--aurora-strength`

The panel is a prototype-only affordance. **For production, ship either the
accent palette switcher (as a settings page) or nothing.** Radius/glass/aurora
sliders aren't user-facing features — they exist so you can preview variants
during design review.

### Animations
- Card hover: `transform: translateY(-2px)` + lifted shadow, `transition: 200ms cubic-bezier(.2,.8,.2,1)`
- Aurora: 28s alternating `translate3d` + scale (keyframe `aurora`)
- Drawer slide: `transform: translateX()` 280ms `var(--ease)`
- Button presses: `transform: translateY(1px)` on `:active`

### Responsive breakpoints
```
≤ 1180px → stat cards 2-up, hub tiles 2-up, POS stacks vertically
≤ 860px  → sidebar becomes off-canvas drawer; hamburger appears in topbar;
           grids collapse to 1 col; tables get horizontal scroll;
           cart rows reflow into 3-col layout with hidden columns
≤ 480px  → stat cards 1-up; brand sub-text hides
```

---

## Files in this bundle

| File | What |
|---|---|
| `tokens.css` | All design tokens + base elements (body, table, button, input, chip). **Drop-in for `src/styles/tokens.css`.** |
| `app.css` | Layout-specific classes (sidebar, topbar, pos-grid, stat cards, tiles, ledger, statements, responsive breakpoints). **Drop-in for `src/styles/app.css`.** |
| `Hassan ERP Redesign.html` | The full clickable mock. Open in a browser. |
| `Hassan ERP Mobile.html` | Shows 5 phone frames side-by-side with the live ERP inside each — preview of the responsive layout. |
| `shell.jsx` | Sidebar + topbar JSX (Babel-in-browser). Reference for the React component tree. |
| `pages1.jsx` | Dashboard, POS. |
| `pages2.jsx` | Catalogue hub, Catalogue → Items page. |
| `pages3.jsx` | Cash book, Sales, Customer / Supplier ledger, Stock, Financial statements, Transactions hub. |
| `icons.jsx` | Inline SVG icon set (used as `<Icon name="..." size={16}/>`). |
| `tweaks-panel.jsx` | The Tweaks panel component (skip in prod; here for completeness). |

---

## Implementation guide (for the codebase)

1. **Drop the CSS:** copy `tokens.css` + `app.css` into `erp-frontend/src/styles/`, `@import` them at the top of `src/index.css`. Keep them in this order — `tokens` must load first.
2. **Wire the theme:** the existing `ThemeContext` already sets `data-theme` on `<html>`. Verify it stays — that's how light/dark flips work.
3. **Replace the sidebar component:** rebuild `Sidebar.tsx` from `shell.jsx`. Keep your existing `NavLink` / `useNavigate` from `react-router`. Each nav item gets the colored gradient icon chip (use the `--nav-*` tokens).
4. **Add the mobile drawer:** wrap `<App>` in a `<div className="app" data-nav={open?'open':'closed'}>`, add `.scrim`, and put a `.mobile-menu-btn` in the topbar that toggles state. CSS already handles the rest.
5. **Rename "Master Data" → "Catalogue"** in the route label, breadcrumb, and any user-facing copy. The URL path can stay `/master` for backwards compat, or migrate to `/catalogue`.
6. **Remove barcode UI:** drop the barcode column from the Items table, drop the "Barcode" form field from the item editor, and update the POS scan input copy to "Type model no. — e.g. DAWLANCE LVS-15". The backend `barcode` field can stay nullable for now; just stop showing/asking for it.
7. **Remove the dashboard "New sale" button** — POS is in the sidebar.
8. **Replace per-component CSS** with the utility classes (`.card`, `.btn .btn-primary`, `.chip-success`, `table.t`, `.tile`, etc.). Reach for inline styles only for one-off micro-positioning.
9. **Aurora backdrop:** the `body::before` rule in `tokens.css` handles it — nothing to wire. If perf is an issue on older cashier PCs, gate it with `prefers-reduced-motion` (already done) or drop it entirely behind a setting.
10. **Skip the Tweaks panel** in prod, or ship just the accent palette switcher as a settings page.

---

## Assets

- **Brand mark:** inline SVG, `<svg viewBox="0 0 24 24"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>` on a `linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)` chip. No bitmap needed.
- **Icons:** all inline SVG in `icons.jsx`. Lift these into a real `Icon.tsx` component (or use Lucide / Heroicons — the names match Lucide).
- **Fonts:** Inter + JetBrains Mono — both already in `erp-frontend/index.html` from prior phase; otherwise pull from Google Fonts.
- **No raster images.** No logos to convert.

---

## Out of scope / known gaps

- The mock data in `shell.jsx` (`ITEMS`, `TX_HISTORY`) is **demo data only** — wire real data from your `items.service` / `sales.service` / etc.
- Forms (Add item, Add customer, etc.) aren't fully designed beyond the field list — use the existing `react-hook-form` patterns and apply `.input` + `.btn` classes.
- The Tweaks panel writes to a JSON block in the HTML file. Don't carry that mechanism into prod.
- Print receipts / print routes are untouched — keep the existing print stylesheet.
- Offline-sync indicators (cloud status badge etc) aren't redesigned; reuse the existing chip with the new `.chip-*` styles.
