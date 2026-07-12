// ─────────────────────────────────────────────────────────────────────────
// Supabase connection for the read-only mobile app.
//
// SUPABASE_URL is the project's REST endpoint (https://<ref>.supabase.co).
// SUPABASE_ANON_KEY is the PUBLIC client key. Supabase's new key format calls
// this the "publishable" key (sb_publishable_…); it replaces the legacy anon
// JWT and maps to the same `anon` Postgres role. Get it from:
//   Supabase dashboard → Project Settings → API keys → Publishable key.
//
// This key is safe to ship inside the APK — it only grants the read access
// configured by supabase/setup.sql. Do NOT put the secret key (sb_secret_…) here.
// ─────────────────────────────────────────────────────────────────────────

export const SUPABASE_URL = 'https://vgjecwkyselvwwvmawvn.supabase.co';

export const SUPABASE_ANON_KEY = 'sb_publishable_LfUNGgtJhNApx7FunWWT4w_5OvsUogW';

export const isConfigured = () =>
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_ANON_KEY.length > 20 &&
  SUPABASE_ANON_KEY !== 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE';
