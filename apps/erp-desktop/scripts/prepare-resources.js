#!/usr/bin/env node
/**
 * Pre-package hook. Run before `electron-builder`:
 *   1. Build the backend (`erp-backend`) so a fresh `dist/` lands on disk.
 *   2. Build the frontend (`erp-frontend`) so a fresh `build/` is ready.
 *   3. Materialise a **production-only** copy of the backend at
 *      `erp-desktop/backend-staging/` — package.json + package-lock.json
 *      copied, then `npm ci --omit=dev` installs only the runtime tree
 *      (~30 MB, ~80 packages) instead of the dev tree (~140 MB, ~470
 *      packages). This avoids bundling Jest / Webpack / TypeScript / ESLint
 *      into the installer; also dodges the chmod-ENOENT race we hit when
 *      electron-builder tried to walk the live dev-tree.
 *   4. Rebuild native deps in `backend-staging/node_modules` for the
 *      packaged Electron's Node ABI (currently `better-sqlite3`).
 *
 * electron-builder's `extraResources` in `package.json` points at
 * `backend-staging/`, NOT `../erp-backend/`, so packaging always copies
 * from the slim staged tree.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'erp-backend');
const FRONTEND_DIR = path.join(REPO_ROOT, 'erp-frontend');
const DESKTOP_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(DESKTOP_DIR, 'backend-staging');

function run(cmd, args, cwd) {
  console.log(`\n→ ${cmd} ${args.join(' ')}\n  (in ${cwd})`);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`✗ Failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status || 1);
  }
}

function exists(p) {
  return fs.existsSync(p);
}

// 1. Backend build
if (!exists(path.join(BACKEND_DIR, 'node_modules'))) {
  run('npm', ['install'], BACKEND_DIR);
}
run('npm', ['run', 'build'], BACKEND_DIR);
if (!exists(path.join(BACKEND_DIR, 'dist', 'main.js'))) {
  console.error('✗ erp-backend build did not produce dist/main.js');
  process.exit(1);
}

// 2. Frontend build
if (!exists(path.join(FRONTEND_DIR, 'node_modules'))) {
  run('npm', ['install'], FRONTEND_DIR);
}
run('npm', ['run', 'build'], FRONTEND_DIR);
if (!exists(path.join(FRONTEND_DIR, 'build', 'index.html'))) {
  console.error('✗ erp-frontend build did not produce build/index.html');
  process.exit(1);
}

// 3. Production-only backend staging.
//    We materialise package.json + package-lock.json + the freshly built
//    dist/, then run `npm ci --omit=dev` so the staging tree only contains
//    runtime deps. Wipe-and-recreate keeps the staging tree honest — no
//    leftover dev deps from a prior run.
console.log('\n→ staging production backend at', STAGING_DIR);
if (exists(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

for (const f of ['package.json', 'package-lock.json']) {
  const src = path.join(BACKEND_DIR, f);
  if (!exists(src)) continue;
  fs.copyFileSync(src, path.join(STAGING_DIR, f));
}
fs.cpSync(path.join(BACKEND_DIR, 'dist'), path.join(STAGING_DIR, 'dist'), {
  recursive: true,
});

run(
  'npm',
  [
    'ci',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
  ],
  STAGING_DIR,
);

// 4. Rebuild native deps in the staging tree for the packaged Electron's
//    Node ABI. `@electron/rebuild` walks the staging node_modules.
run(
  'npx',
  [
    '@electron/rebuild',
    '--module-dir',
    STAGING_DIR,
    '--types',
    'prod,optional',
  ],
  DESKTOP_DIR,
);

console.log('\n✓ Resources prepared. Ready for electron-builder.');
