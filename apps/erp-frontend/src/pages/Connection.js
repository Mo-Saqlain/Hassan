import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * System → Connection. Two things the shop owner asked for:
 *   1. A "Check connection" button that confirms the app is talking to
 *      Supabase (or the local SQLite file) — runs a live SELECT 1 on the
 *      primary database and reports target / host / latency.
 *   2. A manual "Sync now" button to push the local outbox to the cloud on
 *      demand (the same flush the topbar button runs).
 *
 * Note on "background sync": there is no cron. When DATABASE_URL points at
 * Supabase, every save is written to Supabase live — so there's nothing to
 * queue. The outbox/flush path only matters for offline desktop installs that
 * run on local SQLite and push to a central cloud receiver.
 */
export default function Connection() {
  const [conn, setConn] = useState(null);
  const [checking, setChecking] = useState(false);
  const [connError, setConnError] = useState(null);

  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [mirroring, setMirroring] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const check = useCallback(async () => {
    setChecking(true);
    setConnError(null);
    try {
      const r = await api.get('/sync/connection');
      setConn(r.data);
    } catch (e) {
      setConnError(e.uiMessage ?? 'Could not reach the backend.');
      setConn(null);
    } finally {
      setChecking(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/sync/status');
      setStatus(r.data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    check();
    loadStatus();
  }, [check, loadStatus]);

  const syncNow = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await api.post('/sync/flush');
      const s = r.data;
      if (!s?.cloudConfigured) {
        setSyncMsg({ tone: 'warn', text: s?.message ?? 'Cloud sync URL is not configured.' });
      } else if (s.ok) {
        setSyncMsg({ tone: 'ok', text: s.message ?? 'Sync complete.' });
      } else {
        setSyncMsg({ tone: 'err', text: s.message ?? 'Sync failed.' });
      }
      loadStatus();
    } catch (e) {
      setSyncMsg({ tone: 'err', text: e.uiMessage ?? 'Sync request failed.' });
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Queue the whole dataset for push. This is how a cloud that has never been
   * populated gets filled: ordinary sync only carries what changes from now on,
   * so a Supabase project set up after the shop started running would otherwise
   * hold nothing but its schema. Idempotent — every event is an upsert — so
   * running it twice costs bandwidth and nothing else.
   */
  const populateCloud = async () => {
    if (
      !window.confirm(
        'Queue every record for the cloud?\n\nThis is normally needed once, when ' +
          'setting the cloud up. It queues one event per row, then you press ' +
          '"Sync now" to push them. Safe to repeat.',
      )
    ) {
      return;
    }
    setMirroring(true);
    setSyncMsg(null);
    try {
      const r = await api.post('/sync/mirror-all');
      const queued = r.data?.queued ?? 0;
      setSyncMsg({
        tone: queued > 0 ? 'ok' : 'warn',
        text:
          queued > 0
            ? `Queued ${queued} record(s). Press "Sync now" to push them to the cloud.`
            : 'Nothing to queue — there are no records yet.',
      });
      loadStatus();
    } catch (e) {
      setSyncMsg({ tone: 'err', text: e.uiMessage ?? 'Could not queue records.' });
    } finally {
      setMirroring(false);
    }
  };

  const connected = conn?.connected;

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Connection</h1>
          <p>Check the database connection and push pending changes to the cloud on demand.</p>
        </div>
      </div>

      {/* ── Database connection ───────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Database connection</h3>
          <button className="btn btn-primary" onClick={check} disabled={checking}>
            {checking ? 'Checking…' : 'Check connection'}
          </button>
        </div>

        {connError && <div className="alert alert-error" style={{ marginTop: 12 }}>{connError}</div>}

        {conn && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 10 }}>
              <span
                className="chip"
                style={{
                  background: connected ? 'var(--success, #107c10)' : 'var(--danger, #c50f1f)',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                {connected ? '● Connected' : '● Not connected'}
              </span>{' '}
              <strong style={{ marginLeft: 6 }}>{conn.target}</strong>
            </div>
            <table className="t" style={{ fontSize: 13 }}>
              <tbody>
                {conn.host && (
                  <tr><td className="muted">Host</td><td><code>{conn.host}{conn.port ? `:${conn.port}` : ''}</code></td></tr>
                )}
                {conn.database && (
                  <tr><td className="muted">Database</td><td><code>{conn.database}</code></td></tr>
                )}
                <tr><td className="muted">Driver</td><td><code>{conn.driver}</code></td></tr>
                <tr><td className="muted">Round-trip</td><td>{conn.latencyMs} ms</td></tr>
                {conn.error && (
                  <tr><td className="muted">Error</td><td style={{ color: 'var(--danger, #c50f1f)' }}>{conn.error}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Manual cloud sync ─────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Cloud sync</h3>
          <div style={{ display: 'inline-flex', gap: 8 }}>
          <button
            className="btn"
            onClick={populateCloud}
            disabled={mirroring || (status != null && !status.cloudConfigured)}
            title="Queue every existing record for the cloud — needed once when setting the cloud up"
          >
            {mirroring ? 'Queueing…' : 'Populate cloud'}
          </button>
          <button
            className="btn btn-primary"
            onClick={syncNow}
            disabled={syncing || (status != null && !status.cloudConfigured)}
            title={
              status != null && !status.cloudConfigured
                ? 'Not applicable — this install writes directly to its database, so there is no outbox to push.'
                : 'Push any queued offline changes to the cloud now'
            }
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          </div>
        </div>

        {status && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="chip">{status.pending ?? 0} pending</span>
            <span className="chip">{status.failed ?? 0} failed</span>
            <span className={`chip ${status.cloudConfigured ? 'chip-success' : ''}`}>
              {status.cloudConfigured ? 'Cloud push configured' : 'Cloud push not configured'}
            </span>
          </div>
        )}

        {syncMsg && (
          <div
            className={`alert ${syncMsg.tone === 'err' ? 'alert-error' : ''}`}
            style={{
              marginTop: 12,
              ...(syncMsg.tone === 'ok'
                ? { background: 'var(--success-bg, #ecfdf5)', color: 'var(--success, #047857)', padding: '8px 12px' }
                : syncMsg.tone === 'warn'
                  ? { background: 'var(--warning-bg, #fff7ed)', color: 'var(--warning, #c2410c)', padding: '8px 12px' }
                  : {}),
            }}
          >
            {syncMsg.text}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          {status?.cloudConfigured
            ? 'Pushes everything queued in the local outbox to the cloud now. Syncing only happens when you click this (or the topbar button) — there is no background timer.'
            : 'This install writes directly to its database, so every change is saved live — there is no separate sync queue. The cloud-push queue is only used by offline desktop installs that run on local SQLite and push to a central cloud receiver.'}
        </p>
      </div>
    </>
  );
}
