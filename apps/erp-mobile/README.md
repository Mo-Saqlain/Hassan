# Hassan Electronics — Mobile (read-only)

A standalone Android app that shows a **read-only** view of the shop data. It
talks **directly to Supabase** (PostgREST via the public anon key) — it does
**not** use the NestJS backend and it never writes data. It mirrors the numbers
the desktop app shows: dashboard KPIs, sales/purchase history, stock on-hand,
returns, top-selling products, and customer/supplier balances.

Built with Expo (SDK 57) / React Native. Distributed as a signed `.apk` you
sideload onto phones.

## Screens

- **Dashboard** — today & month sales, all-time revenue / gross profit, A/R, A/P, inventory value, low-stock count.
- **History** — sales and purchases (toggle), searchable, tap a row for line items.
- **Stock** — per-item on-hand / available / reserved / value, low-stock filter, search.
- **Returns** — sale and purchase returns (toggle), searchable, tap a row for line items + reason. Badges show where the goods went (restocked / to the company / to the supplier / warranty credit), whether the customer was refunded in cash or given store credit, and whether the return was part of an exchange.
- **Reports** — top products by revenue or profit (toggle), with units sold, brand and margin %.
- **Balances** — customer A/R and supplier A/P (toggle), with outstanding totals.

## One-time setup

### 1. Supabase read access

The mobile app reads with the **anon** key, and some figures (on-hand stock,
balances, per-product profit) are not stored — they're computed by SQL views. Run
[`supabase/setup.sql`](supabase/setup.sql) in the Supabase SQL editor
(logged in as the project owner). It grants the anon role SELECT on the business
tables, adds a **read-only RLS policy** per table (Supabase runs row-level
security, so a bare grant reads back empty; the policy allows SELECT while
INSERT/UPDATE/DELETE stay blocked), and creates `mobile_item_stock`,
`mobile_customer_balance`, `mobile_supplier_balance`, `mobile_product_sales`, and
`mobile_kpis`. It deliberately does **not** expose users/auth, settings,
audit/error logs, or the sync queue.

The script is idempotent (grants are; views use `CREATE OR REPLACE`), so **run it
again after any release that reads a new table or view** — the Returns and Reports
tabs, for example, need the `sale_returns` / `purchase_returns` grants and the
`mobile_product_sales` view added in v1.1.0. A missing grant shows up as a
permission error on the phone, not as a build failure.

#### If setup.sql errors with `column "…" does not exist`

The cloud schema is behind the backend entities. Postgres schema here comes from
TypeORM `synchronize` (`DB_SYNC=true`), **not** from migration files, so a cloud DB
that hasn't seen a backend boot since the last entity change is missing columns —
e.g. `sale_returns.refund_amount`, or `disposition` / `replacement_sale_id` from the
exchange work. Section 0 of the script pre-checks this and lists everything missing
in one message.

Fix it by letting the backend create them, not by hand (hand-written DDL drifts from
what `synchronize` expects on the next boot):

```powershell
cd D:\Hassan\Hassan_Electronics\apps\erp-backend
npm.cmd run build               # compiled entities are what synchronize reads
                                # npm.cmd, not npm — npm.ps1 is blocked by the execution policy

# load the cloud env into this process only (no .env file left behind)
Get-Content ..\..\local\secrets\erp-backend.env | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$') {
    Set-Item -Path "env:$($matches[1])" -Value $matches[2].Trim()
  }
}
node dist\main.js               # wait for "ERP backend listening on …", then Ctrl-C
```

Load the env into the process rather than copying it to `apps/erp-backend/.env` — a
leftover `.env` silently repoints local dev at the cloud instead of SQLite. Snapshot
the database first: `synchronize` reconciles the whole schema and can alter or drop
drifted columns, not just add missing ones.

### 2. Configure the connection

Edit [`src/config.js`](src/config.js):

- `SUPABASE_URL` — already set to `https://vgjecwkyselvwwvmawvn.supabase.co`.
- `SUPABASE_ANON_KEY` — paste the **anon / public** key from Supabase dashboard →
  Project Settings → API → Project API keys. (The anon key is safe to ship in the
  APK — it only grants the read access configured by `setup.sql`. Never put the
  `service_role` key here.)

## Develop

```
cd erp-mobile
npm install
npm start          # Expo dev server; press 'a' for Android, or scan the QR with Expo Go
```

## Build the APK

Requires the Android SDK + a JDK (17–21). On this machine that's
`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot` with
`ANDROID_HOME=C:\dev\android-sdk`, both already set in the environment. Node must
be on the PATH for the Metro bundle step.

Bump `versionCode` + `versionName` in **both** `app.json` and
`android/app/build.gradle` first — Gradle reads only the latter, so bumping one
alone produces a release the phone can't distinguish from the previous install.

```
cd erp-mobile
npx expo prebuild --platform android   # generates android/ (already done once)
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. Copy it to
`erp-mobile/Hassan-Electronics-<versionName>.apk` for distribution.

### Signing

The release build is signed with `android/app/hassan-release.keystore`
(credentials in `android/gradle.properties`, keys `HASSAN_*`). Keep the keystore
safe — future updates must be signed with the same key or phones will refuse to
upgrade over an existing install.

> ⚠️ Re-running `expo prebuild` regenerates `android/` from template and will
> overwrite the signing edits in `android/app/build.gradle` and
> `android/gradle.properties`. If you re-prebuild, re-apply the release
> `signingConfig` and the `HASSAN_*` properties (see git history), and keep the
> keystore file.

## How data flows

```
Local shop node (SQLite)  --Sync push-->  Supabase Postgres  <--anon read--  Mobile APK
```

The cloud DB is populated when the shop clicks **Sync** on the desktop app. The
mobile app only ever reads that cloud copy, so it shows whatever has been synced.
