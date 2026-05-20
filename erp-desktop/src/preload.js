// Bridges the Electron renderer to the main process via a small,
// context-isolated API.
//
// What lives on `window.erpBridge`:
//   - `setTitleBarTheme(theme)` — push a 'light'/'dark' choice so the
//     Windows-drawn min/max/close overlay flips with the in-app theme.
//
// Strict-CSP-safe: no `executeJavaScript()`, no `<script>` injection.
// The CSP `script-src 'self'` in index.html blocks dynamic script
// evaluation inside the page context; IPC bypasses CSP because nothing
// the page parses changes.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('erpBridge', {
  /** @param {'light'|'dark'} theme */
  setTitleBarTheme: (theme) => {
    if (theme !== 'light' && theme !== 'dark') return;
    ipcRenderer.send('erp:set-titlebar-theme', theme);
  },
});
