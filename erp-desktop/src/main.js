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

// Single-instance lock. Without this, double-clicking the shortcut /
// re-launching the .exe spawns a fresh Electron process AND a fresh
// backend, both racing to bind :::3001 — the second loses with
// EADDRINUSE and the dialog gives the user a "Backend stopped" error
// for what should have been a no-op re-launch. With the lock, the
// second launch quits immediately and we just focus the existing
// window (handled in the 'second-instance' listener below).
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Title-bar overlay colour pair per theme. MUST match `--surface-elev`
// from tokens.css exactly — the same token paints the sidebar header
// (.brand) and the topbar, and any drift here produces a visible seam
// between the Windows-drawn min/max/close area and the rest of the bar.
const TITLEBAR_OVERLAY_HEIGHT = 44;
const TITLEBAR_COLORS = {
  light: { color: '#fafafa', symbolColor: '#1f1f1f' },
  dark:  { color: '#333333', symbolColor: '#f5f5f5' },
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
let splashWindow = null;

/**
 * Show a tiny frameless splash while the backend is booting. On first
 * launch the backend can take 30-60 s (TypeORM schema sync, CoA seed,
 * Defender scan, optional Supabase TLS handshake) and without a splash
 * the user just sees a black taskbar entry and assumes the app is broken.
 */
function showSplash(message) {
  if (splashWindow) {
    try {
      splashWindow.webContents.executeJavaScript(
        `document.getElementById('msg').textContent = ${JSON.stringify(message)}`,
      );
    } catch { /* window may be closing */ }
    return;
  }
  splashWindow = new BrowserWindow({
    width: 420,
    height: 220,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: true,
    backgroundColor: '#1f1f1f',
    title: 'Hassan Electronics',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.setMenuBarVisibility(false);
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;background:#1f1f1f;color:#f5f5f5;
        font:14px "Segoe UI Variable","Segoe UI",sans-serif;}
      .wrap{height:100%;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:14px;
        padding:24px;text-align:center;}
      .brand{font-size:18px;font-weight:600;letter-spacing:.3px;}
      .msg{opacity:.8;}
      .bar{width:80%;height:3px;background:#333;overflow:hidden;}
      .bar::after{content:"";display:block;height:100%;width:40%;
        background:#3a8dde;animation:slide 1.2s infinite ease-in-out;}
      @keyframes slide{0%{transform:translateX(-100%);}
        100%{transform:translateX(250%);}}
    </style></head><body><div class="wrap">
      <div class="brand">Hassan Electronics ERP</div>
      <div id="msg" class="msg">${message}</div>
      <div class="bar"></div>
      <div class="msg" style="font-size:12px;opacity:.55;">
        First launch may take up to a minute.</div>
    </div></body></html>`;
  splashWindow.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(html),
  );
  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow) {
    try { splashWindow.close(); } catch { /* already gone */ }
    splashWindow = null;
  }
}

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

  // Mirror backend stdout/stderr to a rolling log under <userData> so that
  // packaged installs (no terminal) still produce something we can inspect
  // when the backend fails to start. Without this, "Backend did not become
  // ready in time" is just a black box.
  const logPath = path.join(app.getPath('userData'), 'backend.log');
  let backendLog = null;
  try {
    backendLog = fs.createWriteStream(logPath, { flags: 'a' });
    backendLog.write(
      `\n\n=== backend launch ${new Date().toISOString()} ===\n` +
        `  entry: ${entry}\n` +
        `  sqlite: ${sqlitePath}\n` +
        `  database: ${databaseUrl ? 'Supabase (DATABASE_URL set)' : 'SQLite (local)'}\n\n`,
    );
  } catch (e) {
    console.warn('[erp-desktop] could not open backend.log:', e.message);
  }

  backendProcess = spawn(process.execPath, [entry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Log spawn details to backend.log so a silent failure produces SOMETHING
  // we can read post-mortem. Without the pid line, an Electron child that
  // is killed by Defender (or any other security software) before its first
  // console.log() leaves zero trace and the only error the user sees is the
  // 90s timeout.
  if (backendLog) {
    backendLog.write(
      `  spawn pid: ${backendProcess.pid}\n` +
        `  execPath:  ${process.execPath}\n\n`,
    );
  }

  backendProcess.stdout.on('data', (b) => {
    process.stdout.write(`[backend] ${b}`);
    if (backendLog) backendLog.write(b);
  });
  backendProcess.stderr.on('data', (b) => {
    process.stderr.write(`[backend] ${b}`);
    if (backendLog) backendLog.write(b);
  });

  // Spawn-level errors (executable not found / not executable / blocked
  // by an EDR product / ENOENT) fire as 'error' events, not 'exit'. We
  // previously had no listener — Node would unhandled-error and crash
  // silently inside the packaged exe. Now we surface it.
  backendProcess.on('error', (err) => {
    const msg = `[spawn error] ${err && err.message ? err.message : String(err)}\n`;
    process.stderr.write(msg);
    if (backendLog) backendLog.write(msg);
  });

  backendProcess.on('exit', (code, signal) => {
    if (backendLog) {
      backendLog.write(
        `[backend exit] code=${code} signal=${signal}\n`,
      );
    }
    backendProcess = null;
    if (code !== 0 && !app.isQuiting) {
      dialog.showErrorBox(
        'Backend stopped',
        `The local ERP backend exited unexpectedly (code ${code}).\n\n` +
          `Diagnostic log: ${logPath}\n\n` +
          `The app will close.`,
      );
      app.quit();
    }
  });
}

/**
 * Polls /api/health until the backend responds 200 OR the backend process
 * dies. First-boot is slow — TypeORM has to synchronise 41 entities,
 * AccountsService seeds the chart of accounts, the journals/CoA hierarchy
 * is provisioned, and (when DATABASE_URL is set) the Supabase Session-Pooler
 * TLS handshake adds another few seconds. On a cold install Windows Defender
 * also scans the unsigned exe before letting Node execute it. Five minutes
 * is enough headroom that the user never sees a spurious timeout on a slow
 * laptop or flaky network. If the backend process exits before then, we
 * short-circuit instead of polling a dead port.
 */
function waitForBackend(timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      reject(new Error(msg));
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    // If the backend dies during startup, stop polling immediately.
    const onExit = (code) => {
      const logPath = path.join(app.getPath('userData'), 'backend.log');
      fail(
        `Backend exited with code ${code} before becoming ready.\n\n` +
          `Diagnostic log: ${logPath}`,
      );
    };
    if (backendProcess) backendProcess.once('exit', onExit);

    function check() {
      if (settled) return;
      const req = http.request(
        {
          host: BACKEND_HOST,
          port: BACKEND_PORT,
          path: '/api/health',
          method: 'GET',
          timeout: 1000,
        },
        (res) => {
          if (res.statusCode === 200) return succeed();
          retry();
        },
      );
      req.on('error', retry);
      req.on('timeout', retry);
      req.end();
    }
    function retry() {
      if (settled) return;
      if (Date.now() > deadline) {
        const logPath = path.join(app.getPath('userData'), 'backend.log');
        return fail(
          `Backend did not become ready within ${Math.round(timeoutMs / 1000)} s.\n\n` +
            `Diagnostic log: ${logPath}`,
        );
      }
      setTimeout(check, 500);
    }
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Hassan Electronics',
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

  // OS-accent push:
  //
  //   * preload.js fetches the accent synchronously at app launch via
  //     IPC ('erp:get-os-accent') and exposes it as window.erpBridge.osAccent.
  //   * When the user changes their Windows / macOS Personalisation
  //     colour mid-session, we relay it via 'erp:os-accent-changed' so
  //     the renderer can apply it live.
  //
  // The previous implementation used webContents.executeJavaScript on
  // did-finish-load — that path is blocked by the renderer's strict CSP
  // (`script-src 'self'` in index.html), which is why "Follow Windows
  // accent" silently failed in the packaged build. IPC bypasses CSP.
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      systemPreferences.on('accent-color-changed', () => {
        const hex = readOsAccentHex();
        if (mainWindow && hex) {
          mainWindow.webContents.send('erp:os-accent-changed', hex);
        }
      });
    } catch {
      /* not all electron versions / platforms emit this — best effort */
    }
  }
}

/**
 * Read the current OS accent colour (Windows / macOS) and return it as
 * a lowercase `#rrggbb` hex string. Returns null on Linux / unsupported
 * builds, or if the OS reports an unparseable value.
 */
function readOsAccentHex() {
  let accent;
  try {
    accent = systemPreferences.getAccentColor();
  } catch {
    return null;
  }
  if (!accent || typeof accent !== 'string') return null;
  // Windows returns AARRGGBB; macOS returns RRGGBB. Strip alpha if present.
  const hex = accent.length === 8 ? accent.slice(2) : accent;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

// Sync IPC. preload.js calls this at preload-time so the value is
// available on window.erpBridge before React mounts (no flash of the
// default Windows blue).
ipcMain.on('erp:get-os-accent', (event) => {
  event.returnValue = readOsAccentHex();
});

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
  showSplash('Starting backend…');
  startBackend();
  try {
    await waitForBackend();
  } catch (err) {
    closeSplash();
    dialog.showErrorBox('Startup error', err.message);
    app.quit();
    return;
  }
  showSplash('Loading interface…');
  await createWindow();
  closeSplash();
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
