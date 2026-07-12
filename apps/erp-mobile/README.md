# Hassan Electronics — Mobile (read-only)

A standalone Android app that shows a **read-only** view of the shop data. It
talks **directly to Supabase** (PostgREST via the public anon key) — it does
**not** use the NestJS backend and it never writes data. It mirrors the numbers
the desktop app shows: dashboard KPIs, sales/purchase history, stock on-hand,
and customer/supplier balances.

Built with Expo (SDK 57) / React Native. Distributed as a signed `.apk` you
sideload onto phones.

## Screens

- **Dashboard** — today & month sales, all-time revenue / gross profit, A/R, A/P, inventory value, low-stock count.
- **History** — sales and purchases (toggle), searchable, tap a row for line items.
- **Stock** — per-item on-hand / available / reserved / value, low-stock filter, search.
- **Balances** — customer A/R and supplier A/P (toggle), with outstanding totals.

## One-time setup

### 1. Supabase read access (run once)

The mobile app reads with the **anon** key, and some figures (on-hand stock,
balances) are not stored — they're computed by SQL views. Run
[`supabase/setup.sql`](supabase/setup.sql) once in the Supabase SQL editor
(logged in as the project owner). It grants the anon role SELECT on the business
tables, adds a **read-only RLS policy** per table (Supabase runs row-level
security, so a bare grant reads back empty; the policy allows SELECT while
INSERT/UPDATE/DELETE stay blocked), and creates `mobile_item_stock`,
`mobile_customer_balance`, `mobile_supplier_balance`, and `mobile_kpis`. It
deliberately does **not** expose users/auth, settings, audit/error logs, or the
sync queue.

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

Requires the Android SDK + a JDK (17–21). On this machine the Android Studio JBR
(`C:\Program Files\Android\Android Studio\jbr`) works.

```
cd erp-mobile
npx expo prebuild --platform android   # generates android/ (already done once)
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.

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
