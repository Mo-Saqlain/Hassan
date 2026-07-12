#!/usr/bin/env node
/**
 * Best-effort postinstall: ensure the backend's native modules
 * (better-sqlite3) are built for Electron's Node ABI, not the system
 * Node ABI. Tries the prebuilt-binary path first (no MSVC required),
 * then falls back to source compile. Never fails npm install — packaging
 * will re-run the same logic strictly via `prepare-resources.js`.
 */
const { rebuild } = require('./rebuild-native');

const code = rebuild({ strictness: 'lenient' });
// Always exit 0 from postinstall so `npm install` succeeds even when the
// native rebuild needs fixing — running `electron .` afterwards will
// surface a clear error, and `npm run package:*` re-runs this strictly.
process.exit(0);
// eslint-disable-next-line no-unused-vars
const _ = code;
