const { app, BrowserWindow, dialog } = require('electron');
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
