/**
 * Accent-colour management.
 *
 * Order of precedence (highest first):
 *   1. User's explicit choice — saved in localStorage under
 *      `hassan-accent-color`. Set by the Settings page.
 *   2. OS accent — Electron writes the user's Windows / macOS
 *      Personalisation accent into `--primary` at `did-finish-load`,
 *      but bails if the localStorage key above is present, so a user
 *      override always wins. The current OS accent is mirrored to
 *      `<html data-os-accent="#hex">` so the Settings page can offer a
 *      "Use OS accent" shortcut.
 *   3. Default Windows blue from `App.css` / `tokens.css`.
 */

export const ACCENT_STORAGE_KEY = 'hassan-accent-color';

/** Fallback accent if nothing is stored and no OS accent is available. */
export const DEFAULT_ACCENT = '#0078d4';

/** Small curated preset palette. Hex values are the light-mode anchor;
 *  the same value is used for both themes — the derived hover/pressed
 *  shades automatically follow. */
export const ACCENT_PRESETS = [
  { name: 'Windows blue', value: '#0078d4' },
  { name: 'Teal', value: '#038387' },
  { name: 'Forest', value: '#107c10' },
  { name: 'Orange', value: '#ca5010' },
  { name: 'Crimson', value: '#c50f1f' },
  { name: 'Pink', value: '#e3008c' },
  { name: 'Purple', value: '#8764b8' },
  { name: 'Indigo', value: '#5c2e91' },
  { name: 'Slate', value: '#5d5a58' },
];

export function getStoredAccent() {
  try {
    const v = localStorage.getItem(ACCENT_STORAGE_KEY);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function setStoredAccent(hex) {
  try {
    if (hex) localStorage.setItem(ACCENT_STORAGE_KEY, hex);
    else localStorage.removeItem(ACCENT_STORAGE_KEY);
  } catch {
    /* private mode / quota — ignore */
  }
}

/**
 * Derive Win10-style hover and pressed shades by darkening the source
 * colour by 12% and 25% respectively. `soft` is a low-alpha rgba()
 * used for chip backgrounds and focus rings. Returns null if the input
 * isn't a six-digit hex.
 */
export function deriveAccentShades(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (n, pct) => Math.max(0, Math.min(255, Math.round(n * (1 - pct))));
  const toHex = (n) => n.toString(16).padStart(2, '0');
  const fmt = (rr, gg, bb) => `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
  // Rec. 601 luminance — used to pick a readable foreground colour on
  // top of the accent fill. Pale colours (yellow / lime) get dark text;
  // everything else gets white. Matches the Electron OS-accent path.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    primary: `#${h.toLowerCase()}`,
    hover: fmt(mix(r, 0.12), mix(g, 0.12), mix(b, 0.12)),
    pressed: fmt(mix(r, 0.25), mix(g, 0.25), mix(b, 0.25)),
    soft: `rgba(${r}, ${g}, ${b}, 0.18)`,
    fg: luminance > 0.6 ? '#1f1f1f' : '#ffffff',
  };
}

/**
 * Write the accent variables onto `<html>`. Used by the boot script
 * (so there's no flash of the default Windows blue on page load) and
 * by the Settings page when the user picks a new colour.
 */
export function applyAccent(hex) {
  if (typeof document === 'undefined') return false;
  const shades = deriveAccentShades(hex);
  if (!shades) return false;
  const root = document.documentElement;
  root.style.setProperty('--primary', shades.primary);
  root.style.setProperty('--primary-hover', shades.hover);
  root.style.setProperty('--primary-soft', shades.soft);
  root.style.setProperty('--primary-fg', shades.fg);
  root.style.setProperty('--info', shades.primary);
  root.style.setProperty('--border-glow', shades.primary);
  root.style.setProperty('--accent-pressed', shades.pressed);
  return true;
}

/**
 * Remove the inline overrides so the document falls back to whatever
 * the CSS / Electron injection sets. Called when the user picks
 * "Reset to default" or "Use OS accent".
 */
export function clearAppliedAccent() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.removeProperty('--primary');
  root.style.removeProperty('--primary-hover');
  root.style.removeProperty('--primary-soft');
  root.style.removeProperty('--primary-fg');
  root.style.removeProperty('--info');
  root.style.removeProperty('--border-glow');
  root.style.removeProperty('--accent-pressed');
}

/**
 * OS accent exposed by the Electron main process via a `data-os-accent`
 * attribute on `<html>`. Returns null in the browser build.
 */
export function getOsAccent() {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.getAttribute('data-os-accent');
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}
