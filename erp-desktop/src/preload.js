// Bridges the Electron renderer to the main process via a small,
// context-isolated API. The renderer uses this exclusively to keep
// the Windows title-bar-overlay colours in sync with the React theme
// toggle — there are no other powers exposed here.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('erpBridge', {
  /** @param {'light'|'dark'} theme */
  setTitleBarTheme: (theme) => {
    if (theme !== 'light' && theme !== 'dark') return;
    ipcRenderer.send('erp:set-titlebar-theme', theme);
  },
});
