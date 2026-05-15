// Applies the saved/system theme before React renders to avoid a flash of
// the wrong theme. Loaded synchronously from the document <head>; intentionally
// not bundled by webpack because (a) it must run before bundle execution and
// (b) extracting it from index.html unblocks a strict Content-Security-Policy
// with `script-src 'self'` (no `'unsafe-inline'`).
(function () {
  try {
    var saved = localStorage.getItem('hassan-theme');
    var theme =
      saved ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
