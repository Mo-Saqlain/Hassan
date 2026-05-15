import { useEffect, useRef } from 'react';

const DEFAULT_MESSAGE =
  'You have unsaved changes. Leave this page and discard them?';

/**
 * Prompts the user before in-app navigation OR tab close/refresh whenever
 * `when` is true. Wire it into every form site so accidentally clicking a
 * sidebar link mid-edit doesn't silently throw away the user's typing.
 *
 * The app uses the declarative `<HashRouter>` (not a data router), so
 * React Router 7's `useBlocker` isn't available. Instead, we intercept
 * clicks on `<a href="#/…">` at the document level in the capture phase —
 * that catches every sidebar NavLink and hub-tab click before React
 * Router's listener gets it. `beforeunload` handles tab close / refresh.
 * Programmatic navigation (rare in this app) is intentionally not blocked.
 */
export function useUnsavedChangesPrompt(when, message = DEFAULT_MESSAGE) {
  // Keep the latest dirty flag in a ref so the listeners (installed once
  // per dirty→clean transition) can read the *current* value without
  // re-binding on every keystroke.
  const dirtyRef = useRef(when);
  dirtyRef.current = when;

  useEffect(() => {
    if (!when) return undefined;

    const beforeUnload = (e) => {
      e.preventDefault();
      // Chromium requires returnValue to be set for the prompt to show.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);

    const onClick = (e) => {
      if (!dirtyRef.current) return;
      // Find the nearest <a> in the event path.
      let el = e.target;
      while (el && el.nodeType === 1 && el.tagName !== 'A') {
        el = el.parentElement;
      }
      if (!el || el.tagName !== 'A') return;
      const href = el.getAttribute('href');
      // Only intercept hash-route links (e.g. "#/items"). External links
      // and `<a>` elements without an href (used as buttons) pass through.
      if (!href || !href.startsWith('#')) return;
      // Same-route clicks (e.g. the active tab) don't actually navigate.
      if (href === window.location.hash) return;
      // Modifier-clicks open in a new tab — don't prompt.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

      // eslint-disable-next-line no-alert
      const ok = window.confirm(message);
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    // Capture phase so we run before React Router's bubbled handler.
    document.addEventListener('click', onClick, true);

    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [when, message]);
}
