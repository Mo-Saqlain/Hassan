import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Icon from './Icon';

/**
 * Topbar "Sync now" button. Triggers `POST /sync/flush` on click — there
 * is no background cron, syncing happens only when the user asks for it.
 *
 * Behaviour:
 *   - Shows the pending count as a small badge when there are queued events.
 *   - On click, calls the backend; spinner animates while in flight.
 *   - Shows a short status pill (success / nothing / error) for ~3 seconds.
 *   - Polls `/sync/status` every 30 s to keep the badge fresh.
 *   - Hides itself entirely when `CLOUD_SYNC_URL` is not configured —
 *     no point offering a button that always errors out.
 */
export default function SyncButton() {
  const [pending, setPending] = useState(0);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null); // { tone, text } | null

  // Initial + periodic status poll. /sync/status is cheap (just a count).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await api.get('/sync/status');
        if (cancelled) return;
        setPending(r.data?.pending ?? 0);
        setCloudConfigured(!!r.data?.cloudConfigured);
      } catch {
        if (cancelled) return;
        setCloudConfigured(false);
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const flashFor = (tone, text, ms = 3000) => {
    setFlash({ tone, text });
    window.setTimeout(() => setFlash(null), ms);
  };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const r = await api.post('/sync/flush');
      const s = r.data;
      if (!s?.cloudConfigured) {
        flashFor('warn', s?.message || 'Cloud sync URL not configured.');
      } else if (s.ok) {
        flashFor('ok', s.message || 'Sync complete.');
      } else {
        flashFor('err', s.message || 'Sync failed.');
      }
      // Refresh pending count after a run.
      try {
        const st = await api.get('/sync/status');
        setPending(st.data?.pending ?? 0);
      } catch {
        /* ignore */
      }
    } catch (err) {
      flashFor('err', err.uiMessage || err.message || 'Sync request failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!cloudConfigured) return null;

  const title = busy
    ? 'Syncing…'
    : pending > 0
      ? `Sync now — ${pending} event${pending === 1 ? '' : 's'} pending`
      : 'Sync now — outbox is empty';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="btn btn-sm btn-icon btn-ghost"
        onClick={run}
        disabled={busy}
        aria-label={title}
        title={title}
        style={{ position: 'relative' }}
      >
        <Icon
          name="rotate"
          size={16}
          style={busy ? { animation: 'sync-spin 0.9s linear infinite' } : undefined}
        />
        {pending > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 14,
              height: 14,
              padding: '0 3px',
              fontSize: 9,
              fontWeight: 700,
              lineHeight: '14px',
              textAlign: 'center',
              color: 'var(--primary-fg, #fff)',
              background: 'var(--primary, #c50f1f)',
              border: '1px solid var(--bg-elev, #fff)',
              boxSizing: 'border-box',
            }}
          >
            {pending > 99 ? '99+' : pending}
          </span>
        )}
      </button>
      {flash && (
        <span
          role="status"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            whiteSpace: 'nowrap',
            fontSize: 12,
            padding: '6px 10px',
            background:
              flash.tone === 'ok'
                ? 'var(--success, #107c10)'
                : flash.tone === 'warn'
                  ? 'var(--warning, #ca5010)'
                  : 'var(--danger, #c50f1f)',
            color: '#fff',
            border: '1px solid currentColor',
            zIndex: 20,
          }}
        >
          {flash.text}
        </span>
      )}
      <style>{`@keyframes sync-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
