// Applies the saved/system theme + accent before React renders to avoid
// a flash of the wrong colours. Loaded synchronously from the document
// <head>; intentionally not bundled by webpack because (a) it must run
// before bundle execution and (b) extracting it from index.html unblocks
// a strict Content-Security-Policy with `script-src 'self'` (no
// `'unsafe-inline'`).
(function () {
  // ── 1. Theme (light/dark) ───────────────────────────────────────────
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

  // ── 2. Accent colour ────────────────────────────────────────────────
  // Precedence:
  //   (a) Stored override in localStorage (user picked Custom accent)
  //   (b) OS accent exposed by Electron preload bridge (Follow Windows)
  //   (c) Default Windows blue from tokens.css
  //
  // Applying (a) or (b) here — before React mounts — avoids a flash of
  // the default Windows blue between paint and React's first effect.
  try {
    var stored = null;
    try {
      var raw = localStorage.getItem('hassan-accent-color');
      if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) stored = raw.toLowerCase();
    } catch (_) {
      stored = null;
    }

    var osAccent = null;
    try {
      var bridged = window.erpBridge && window.erpBridge.osAccent;
      if (bridged && /^#[0-9a-fA-F]{6}$/.test(bridged)) {
        osAccent = bridged.toLowerCase();
        document.documentElement.setAttribute('data-os-accent', osAccent);
      }
    } catch (_) {
      osAccent = null;
    }

    var pick = stored || osAccent;
    if (!pick) return;

    var h = pick.replace('#', '');
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);

    function mix(n, pct) {
      var v = Math.round(n * (1 - pct));
      return v < 0 ? 0 : v > 255 ? 255 : v;
    }
    function toHex(n) {
      var s = n.toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    function fmt(rr, gg, bb) {
      return '#' + toHex(rr) + toHex(gg) + toHex(bb);
    }
    var primary = pick;
    var hover = fmt(mix(r, 0.12), mix(g, 0.12), mix(b, 0.12));
    var pressed = fmt(mix(r, 0.25), mix(g, 0.25), mix(b, 0.25));
    var soft = 'rgba(' + r + ',' + g + ',' + b + ',0.18)';
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    var fg = luminance > 0.6 ? '#1f1f1f' : '#ffffff';

    var root = document.documentElement;
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-hover', hover);
    root.style.setProperty('--primary-soft', soft);
    root.style.setProperty('--primary-fg', fg);
    root.style.setProperty('--info', primary);
    root.style.setProperty('--border-glow', primary);
    root.style.setProperty('--accent-pressed', pressed);
  } catch (e) {
    /* swallow — accent boot is best-effort, default blue still works */
  }
})();
