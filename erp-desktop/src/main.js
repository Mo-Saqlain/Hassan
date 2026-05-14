const { app, BrowserWindow, dialog, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const isDev = process.env.ERP_DESKTOP_DEV === '1';
const BACKEND_PORT = Number(process.env.ERP_BACKEND_PORT || 3001);
const BACKEND_HOST = '127.0.0.1';

let backendProcess = null;
let mainWindow = null;

function backendEntry() {
  return path.resolve(__dirname, '..', '..', 'erp-backend', 'dist', 'main.js');
}

function frontendBuild() {
  return path.resolve(__dirname, '..', '..', 'erp-frontend', 'build', 'index.html');
}

function frontendDevUrl() {
  return process.env.ERP_FRONTEND_DEV_URL || 'http://localhost:3000';
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

  backendProcess = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      SQLITE_PATH: sqlitePath,
    },
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
    title: 'ERP · Phase 1',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await mainWindow.loadURL(frontendDevUrl());
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const build = frontendBuild();
    if (!fs.existsSync(build)) {
      dialog.showErrorBox(
        'Frontend build missing',
        `Could not find React build at:\n${build}\n\nRun \`npm run build\` inside erp-frontend first.`,
      );
      app.quit();
      return;
    }
    await mainWindow.loadFile(build);
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

  const js = `
    (function () {
      const root = document.documentElement;
      root.style.setProperty('--primary', '${primary}');
      root.style.setProperty('--primary-hover', '${hover}');
      root.style.setProperty('--primary-soft', '${soft}');
      root.style.setProperty('--primary-fg', '${fg}');
      root.style.setProperty('--info', '${primary}');
      root.style.setProperty('--border-glow', '${primary}');
      root.style.setProperty('--accent-pressed', '${pressed}');
      root.setAttribute('data-os-accent', '${primary}');
    })();
  `;
  mainWindow.webContents.executeJavaScript(js).catch(() => {});
}

app.whenReady().then(async () => {
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
