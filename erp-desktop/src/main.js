const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// Drop the default File/Edit/View/Window/Help menu. The app has its own
// in-canvas chrome (sidebar + topbar) — the native menu bar adds visual
// noise without adding capability.
Menu.setApplicationMenu(null);

// Title-bar overlay colour pair per theme (matches tokens.css surfaces).
const TITLEBAR_OVERLAY_HEIGHT = 44;
const TITLEBAR_COLORS = {
  light: { color: '#fafafa', symbolColor: '#1f1f1f' },
  dark:  { color: '#2c2c2c', symbolColor: '#f5f5f5' },
};

const isDev = process.env.ERP_DESKTOP_DEV === '1';
const BACKEND_PORT = Number(process.env.ERP_BACKEND_PORT || 3001);
const BACKEND_HOST = '127.0.0.1';

// Register a custom `app://` scheme BEFORE app.whenReady so the renderer
// can be served over `app://localhost/...` instead of `file://`. Loading
// over `file://` breaks any library that does `new URL(path, location.origin)`
// — Chromium reports `location.origin === "null"` for file:// pages and the
// URL constructor throws "Invalid URL". React Router 7's internals hit this.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

// Minimal mime map for the static assets the React build ships.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
};

function frontendBuildDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'build');
  }
  return path.resolve(__dirname, '..', '..', 'erp-frontend', 'build');
}

function registerAppProtocol() {
  const buildDir = frontendBuildDir();
  protocol.handle('app', (req) => {
    try {
      const url = new URL(req.url);
      let pathname = decodeURIComponent(url.pathname || '/');
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      // Normalise + prevent path traversal outside the build dir.
      let filePath = path.normalize(path.join(buildDir, pathname));
      if (!filePath.startsWith(buildDir)) {
        filePath = path.join(buildDir, 'index.html');
      }
      // SPA fallback: anything that isn't a real file resolves to index.html
      // so client-side routing (HashRouter or future BrowserRouter) works.
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        filePath = path.join(buildDir, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache' },
      });
    } catch (e) {
      return new Response(`app:// handler error: ${e.message}`, { status: 500 });
    }
  });
}

let backendProcess = null;
let mainWindow = null;

function backendEntry() {
  // When packaged (`app.isPackaged`) the compiled backend is unpacked into
  // `<resources>/backend/dist`. In dev we still point at the sibling
  // workspace folder so `npm run dev` keeps working without a rebuild.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'dist', 'main.js');
  }
  return path.resolve(__dirname, '..', '..', 'erp-backend', 'dist', 'main.js');
}

function frontendDevUrl() {
  return process.env.ERP_FRONTEND_DEV_URL || 'http://localhost:3000';
}

/**
 * Load user-editable runtime config from `<userData>/config.json`. The
 * shop owner can set `cloudSyncUrl`, `databaseUrl`, etc. without having
 * to re-install the app. Returns `{}` if the file is missing or invalid.
 */
function readUserConfig() {
  try {
    const file = path.join(app.getPath('userData'), 'config.json');
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) || {};
  } catch (e) {
    console.warn('[erp-desktop] could not read user config:', e.message);
    return {};
  }
}

function startBackend() {
  const entry = backendEntry();
  if (!fs.existsSync(entry)) {
    dialog.showErrorBox(
      'Backend build missing',
      `Could not find compiled backend at:\n${entry}\n\nRun \`npm run build\` inside erp-backend first.`,
    );
    app.quit();
    return;
  }

  const sqlitePath = path.join(app.getPath('userData'), 'erp.sqlite');
  const userCfg = readUserConfig();

  // Cloud-sync URL precedence:
  //   1. process.env.CLOUD_SYNC_URL  — useful for ad-hoc testing
  //   2. <userData>/config.json `cloudSyncUrl` — what the installer ships;
  //      the shop owner can edit this without re-installing
  //   3. unset — the worker stays idle and outbox events queue up locally
  const cloudSyncUrl =
    process.env.CLOUD_SYNC_URL || userCfg.cloudSyncUrl || '';
  // Same idea for DATABASE_URL — set this to a Supabase Session-Pooler
  // URL and the backend will skip SQLite and run against Supabase directly.
  const databaseUrl = process.env.DATABASE_URL || userCfg.databaseUrl || '';

  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    SQLITE_PATH: sqlitePath,
    BACKUP_DIR: path.join(app.getPath('userData'), 'backups'),
    // Apply pending TypeORM migrations before the backend opens its port.
    // The bundled NestJS code respects this flag in `main.ts` — schema
    // upgrades land on launch without user intervention.
    DB_MIGRATE_ON_BOOT: 'true',
    // Make Electron's executable behave as plain Node when launched as a
    // child process — required to run the NestJS backend script under the
    // packaged Electron runtime.
    ELECTRON_RUN_AS_NODE: '1',
  };
  if (cloudSyncUrl) env.CLOUD_SYNC_URL = cloudSyncUrl;
  if (databaseUrl) {
    env.DATABASE_URL = databaseUrl;
    env.DB_SSL = env.DB_SSL || 'true';
    env.DB_SYNC = env.DB_SYNC || 'true';
  }

  backendProcess = spawn(process.execPath, [entry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (b) => process.stdout.write(`[backend] ${b}`));
  backendProcess.stderr.on('data', (b) => process.stderr.write(`[backend] ${b}`));

  backendProcess.on('exit', (code) => {
    backendProcess = null;
    if (code !== 0 && !app.isQuiting) {
      dialog.showErrorBox(
        'Backend stopped',
        `The local ERP backend exited unexpectedly (code ${code}). The app will close.`,
      );
      app.quit();
    }
  });
}

function waitForBackend(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.request(
        {
          host: BACKEND_HOST,
          port: BACKEND_PORT,
          path: '/api/health',
          method: 'GET',
          timeout: 1000,
        },
        (res) => {
          if (res.statusCode === 200) return resolve();
          retry();
        },
      );
      req.on('error', retry);
      req.on('timeout', retry);
      req.end();
    }
    function retry() {
      if (Date.now() > deadline) {
        return reject(new Error('Backend did not become ready in time'));
      }
      setTimeout(check, 300);
    }
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Hassan Electronics ERP',
    // VS Code-style integrated title bar: no native title bar, but Windows
    // still draws the minimize / maximize / close controls on the right via
    // `titleBarOverlay`. The in-app `.topbar` becomes the drag region.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      ...TITLEBAR_COLORS.light,
      height: TITLEBAR_OVERLAY_HEIGHT,
    },
    autoHideMenuBar: true,
    backgroundColor: '#f3f3f3',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Sandbox the renderer: the preload script runs in a restricted
      // V8 context with no Node APIs except `contextBridge` and
      // `ipcRenderer`. A renderer compromise (hypothetical XSS) cannot
      // touch the SQLite file, the filesystem, or shell out to the OS.
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  // Defensive: even with titleBarStyle: 'hidden' some Electron versions
  // still surface the menu via Alt — make sure it stays gone.
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  if (isDev) {
    await mainWindow.loadURL(frontendDevUrl());
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const buildDir = frontendBuildDir();
    const index = path.join(buildDir, 'index.html');
    if (!fs.existsSync(index)) {
      dialog.showErrorBox(
        'Frontend build missing',
        `Could not find React build at:\n${index}\n\nRun \`npm run build\` inside erp-frontend first.`,
      );
      app.quit();
      return;
    }
    // Use the custom `app://` scheme registered above. Loading via this
    // scheme gives the renderer a valid origin (`app://localhost`), which
    // is what every URL-constructor in the codebase (axios, react-router
    // internals, …) needs. `loadFile()` would use file:// and crash with
    // "Failed to construct 'URL': Invalid URL".
    await mainWindow.loadURL('app://localhost/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Once the renderer is ready, push the OS accent colour into the page
  // so the ERP picks up the user's Personalisation choice instead of the
  // hard-coded Windows blue. Re-pushes on accent-color-changed so the
  // UI stays in sync if the user changes their theme while the app is
  // running.
  mainWindow.webContents.on('did-finish-load', applyOsAccentColor);
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      systemPreferences.on('accent-color-changed', applyOsAccentColor);
    } catch {
      /* not all electron versions / platforms emit this — best effort */
    }
  }
}

/**
 * Read the OS accent colour (Windows / macOS) and inject it as the ERP's
 * `--primary` CSS variable plus a few derived hover/pressed shades and a
 * matching focus-ring rgba. Falls back silently on Linux / unsupported
 * builds where `getAccentColor()` isn't available.
 */
function applyOsAccentColor() {
  if (!mainWindow) return;
  let accent;
  try {
    accent = systemPreferences.getAccentColor();
  } catch {
    return;
  }
  if (!accent || typeof accent !== 'string') return;
  // Windows returns AARRGGBB; macOS returns RRGGBB. Strip alpha if present.
  const hex = accent.length === 8 ? accent.slice(2) : accent;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return;
  const primary = `#${hex.toLowerCase()}`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Hover = mix 12% black, pressed = mix 25% black, soft = 18% alpha tint.
  const mix = (n, pct) => Math.max(0, Math.min(255, Math.round(n * (1 - pct))));
  const hover = `#${[mix(r, 0.12), mix(g, 0.12), mix(b, 0.12)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
  const pressed = `#${[mix(r, 0.25), mix(g, 0.25), mix(b, 0.25)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
  const soft = `rgba(${r}, ${g}, ${b}, 0.18)`;
  // Pick a readable foreground for the accent fill (Windows uses
  // luminance for the same purpose so e.g. a pale yellow accent gets
  // dark text instead of unreadable white).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const fg = luminance > 0.6 ? '#1f1f1f' : '#ffffff';

  // `data-os-accent` is set unconditionally so the Settings page can
  // surface a "Use OS accent" button even when the user has overridden
  // the accent. The CSS-variable overrides, on the other hand, are
  // only applied when the user has NOT picked their own colour — the
  // localStorage entry written by the Settings page wins.
  const js = `
    (function () {
      const root = document.documentElement;
      root.setAttribute('data-os-accent', '${primary}');
      try {
        if (localStorage.getItem('hassan-accent-color')) return;
      } catch (_) { /* ignore */ }
      root.style.setProperty('--primary', '${primary}');
      root.style.setProperty('--primary-hover', '${hover}');
      root.style.setProperty('--primary-soft', '${soft}');
      root.style.setProperty('--primary-fg', '${fg}');
      root.style.setProperty('--info', '${primary}');
      root.style.setProperty('--border-glow', '${primary}');
      root.style.setProperty('--accent-pressed', '${pressed}');
    })();
  `;
  mainWindow.webContents.executeJavaScript(js).catch(() => {});
}

ipcMain.on('erp:set-titlebar-theme', (_event, theme) => {
  if (!mainWindow) return;
  const colors = TITLEBAR_COLORS[theme === 'dark' ? 'dark' : 'light'];
  try {
    mainWindow.setTitleBarOverlay({
      ...colors,
      height: TITLEBAR_OVERLAY_HEIGHT,
    });
  } catch {
    /* setTitleBarOverlay is Windows-only; ignore on macOS / Linux */
  }
});

app.whenReady().then(async () => {
  registerAppProtocol();
  startBackend();
  try {
    await waitForBackend();
  } catch (err) {
    dialog.showErrorBox('Startup error', err.message);
    app.quit();
    return;
  }
  await createWindow();
});

app.on('window-all-closed', () => {
  app.isQuiting = true;
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (backendProcess) backendProcess.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
