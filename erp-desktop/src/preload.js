// Bridges the Electron renderer to the main process via a small,
// context-isolated API.
//
// What lives on `window.erpBridge`:
//   - `setTitleBarTheme(theme)` — push a 'light'/'dark' choice so the
//     Windows-drawn min/max/close overlay flips with the in-app theme.
//   - `osAccent`                — the user's Windows / macOS accent
//     colour at preload time (`#rrggbb` or null). Synchronously
//     fetched from the main process so the page-load boot script can
//     apply it before React mounts; no flash of default blue.
//   - `onOsAccentChange(cb)`    — subscribe to live OS accent updates
//     (Windows fires this when the user switches Personalisation).
//
// Strict-CSP-safe: no `executeJavaScript()`, no `<script>` injection.
// The CSP `script-src 'self'` in index.html blocks dynamic script
// evaluation inside the page context, which broke the previous
// did-finish-load accent push; IPC bypasses CSP because nothing the
// page parses changes.
const { contextBridge, ipcRenderer } = require('electron');

// Sync IPC at preload time. Safe here because preload blocks the
// renderer's first paint anyway, and the round-trip is microseconds.
let osAccent = null;
try {
  osAccent = ipcRenderer.sendSync('erp:get-os-accent');
} catch (_) {
  osAccent = null;
}

contextBridge.exposeInMainWorld('erpBridge', {
  /** Hex `#rrggbb` of the OS accent at app launch, or null on Linux. */
  osAccent,

  /** @param {'light'|'dark'} theme */
  setTitleBarTheme: (theme) => {
    if (theme !== 'light' && theme !== 'dark') return;
    ipcRenderer.send('erp:set-titlebar-theme', theme);
  },

  /**
   * Subscribe to live OS accent changes (e.g. user opens Windows
   * Settings → Personalisation → Colors and picks a new accent).
   * Returns an unsubscribe function.
   */
  onOsAccentChange: (cb) => {
    const handler = (_event, hex) => {
      try {
        cb(hex || null);
      } catch (_) {
        /* swallow — main-process IPC must not throw on bad listeners */
      }
    };
    ipcRenderer.on('erp:os-accent-changed', handler);
    return () => ipcRenderer.removeListener('erp:os-accent-changed', handler);
  },
});
