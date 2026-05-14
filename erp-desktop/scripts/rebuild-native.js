#!/usr/bin/env node
/**
 * Shared native-module rebuild helper. Used by both `postinstall.js` and
 * `prepare-resources.js`.
 *
 * Strategy (in order):
 *   1. Ask `prebuild-install` for the Electron-runtime prebuilt binary of
 *      every native package we ship. better-sqlite3 publishes Electron
 *      prebuilts on GitHub — pulling one of those avoids node-gyp,
 *      Python, and MSVC entirely. This is the path that works on a
 *      vanilla Windows PC.
 *   2. If no matching prebuilt is published (e.g. Electron version too
 *      new), fall back to `@electron/rebuild` which will try to source-
 *      compile via node-gyp.
 *   3. If both fail, print clear, actionable next steps and return a
 *      non-zero exit code — the caller decides whether that's fatal
 *      (packaging) or just a warning (dev install).
 *
 * Exit codes:
 *   0  — at least one strategy worked for every native module
 *   1  — every strategy failed; caller should decide what to do
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DESKTOP_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.resolve(__dirname, '..', '..', 'erp-backend');
const NATIVE_PACKAGES = ['better-sqlite3'];

function readElectronVersion() {
  try {
    const pkg = require(path.join(DESKTOP_DIR, 'node_modules', 'electron', 'package.json'));
    return pkg.version;
  } catch {
    return null;
  }
}

function hasModule(name) {
  return fs.existsSync(path.join(BACKEND_DIR, 'node_modules', name));
}

function prebuildBin() {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const p = path.join(BACKEND_DIR, 'node_modules', '.bin', `prebuild-install${ext}`);
  return fs.existsSync(p) ? p : null;
}

function tryPrebuilt(modName, electronVersion) {
  const bin = prebuildBin();
  if (!bin) {
    console.warn(`  prebuild-install not found — skipping prebuilt strategy for ${modName}`);
    return false;
  }
  const modDir = path.join(BACKEND_DIR, 'node_modules', modName);
  if (!fs.existsSync(modDir)) {
    console.warn(`  ${modName} not installed in erp-backend — skipping`);
    return true; // not our problem
  }
  console.log(`  → prebuild-install ${modName} for electron@${electronVersion}`);
  const r = spawnSync(
    bin,
    ['--runtime=electron', `--target=${electronVersion}`, '--verbose'],
    { cwd: modDir, stdio: 'inherit' },
  );
  return r.status === 0;
}

function tryRebuild(electronVersion) {
  console.log('  → @electron/rebuild fallback (will try to source-compile)');
  const r = spawnSync(
    'npx',
    [
      '@electron/rebuild',
      '--module-dir', BACKEND_DIR,
      '--electron-version', electronVersion,
      '--types', 'prod,optional',
    ],
    { cwd: DESKTOP_DIR, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  return r.status === 0;
}

function rebuild({ strictness = 'lenient' } = {}) {
  if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
    console.log('[rebuild-native] erp-backend not installed yet — skipping');
    return 0;
  }

  const electronVersion = readElectronVersion();
  if (!electronVersion) {
    console.warn('[rebuild-native] electron not installed in erp-desktop yet — skipping');
    return 0;
  }

  console.log(`[rebuild-native] target electron@${electronVersion}`);

  let allOk = true;
  for (const mod of NATIVE_PACKAGES) {
    if (!hasModule(mod)) continue;
    console.log(`\n• ${mod}`);
    const ok = tryPrebuilt(mod, electronVersion);
    if (!ok) {
      console.log(`  ✗ no Electron prebuilt available for ${mod}@${pkgVersion(mod)} on this Electron`);
      allOk = false;
    } else {
      console.log(`  ✓ prebuilt installed for ${mod}`);
    }
  }

  if (allOk) return 0;

  // At least one module didn't get a prebuilt — try compile fallback.
  console.log('\nFalling back to source compile via @electron/rebuild …');
  const compiled = tryRebuild(electronVersion);
  if (compiled) {
    console.log('✓ source compile succeeded');
    return 0;
  }

  printNextSteps(strictness);
  return 1;
}

function pkgVersion(modName) {
  try {
    const p = path.join(BACKEND_DIR, 'node_modules', modName, 'package.json');
    return require(p).version;
  } catch { return '?'; }
}

function printNextSteps(strictness) {
  const banner =
    strictness === 'strict'
      ? '\n✖ Native module rebuild failed. Packaging cannot continue.'
      : '\n⚠ Native module rebuild failed. The desktop dev launcher may still work if the existing build/Release/*.node was compiled for a compatible ABI, but you should fix this before packaging.';
  console.error(banner);
  console.error('\nOptions to fix on Windows:');
  console.error(
    '  1. Install MSVC build tools so node-gyp can compile from source:',
  );
  console.error(
    '       https://github.com/nodejs/node-gyp#on-windows',
  );
  console.error(
    '     Quick path (admin PowerShell):',
  );
  console.error(
    '       npm install --global --production windows-build-tools',
  );
  console.error(
    '     Or install "Desktop development with C++" workload from Visual Studio Installer.',
  );
  console.error(
    '  2. Pin Electron to a version that has a better-sqlite3 prebuilt:',
  );
  console.error(
    '     Check https://github.com/WiseLibs/better-sqlite3/releases for ABI coverage.',
  );
  console.error(
    '  3. As a last resort, build the installer from a CI runner that has',
  );
  console.error(
    '     MSVC + Python pre-installed (GitHub Actions windows-latest works).\n',
  );
}

if (require.main === module) {
  const strict = process.argv.includes('--strict');
  const code = rebuild({ strictness: strict ? 'strict' : 'lenient' });
  process.exit(code);
}

module.exports = { rebuild };
