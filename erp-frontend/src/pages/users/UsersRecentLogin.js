import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function UsersRecentLogin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/users/login-events?limit=200');
      setRows(r.data);
      await api.post('/users/login-events/mark-seen').catch(() => {});
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load login events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Recent logins</h2>
        <button className="btn btn-sm" onClick={reload}>
          Refresh
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card muted center">No logins recorded yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Username</th>
              <th>IP</th>
              <th>User agent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmt(r.createdAt)}</td>
                <td>
                  <strong>{r.username}</strong>
                  {!r.seenByAdmin && (
                    <span
                      className="badge badge-green"
                      style={{ marginLeft: 6 }}
                    >
                      new
                    </span>
                  )}
                </td>
                <td>{r.ipAddress ?? '—'}</td>
                <td
                  className="muted"
                  style={{ fontSize: 12, maxWidth: 320, wordBreak: 'break-all' }}
                >
                  {r.userAgent ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
