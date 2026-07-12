import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from '../components/ExportButtons';

const LEVELS = ['ERROR', 'WARN'];

export default function ErrorLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    level: '',
    source: '',
    from: '',
    to: '',
    limit: 500,
  });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filters.level) qs.set('level', filters.level);
      if (filters.source) qs.set('source', filters.source);
      if (filters.from) qs.set('from', `${filters.from}T00:00:00`);
      if (filters.to) qs.set('to', `${filters.to}T23:59:59`);
      if (filters.limit) qs.set('limit', String(filters.limit));
      const r = await api.get(`/error-logs?${qs.toString()}`, {
        params: { _ts: Date.now() },
      });
      setRows(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const sources = useMemo(() => {
    const set = new Set(rows.map((r) => r.source).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.message, r.path, r.source, r.method, String(r.statusCode ?? '')]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const clear = async () => {
    if (!window.confirm('Wipe the error log? This cannot be undone.')) return;
    try {
      await api.delete('/error-logs');
      load();
    } catch (e) {
      alert(e.uiMessage ?? 'Clear failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Errors &amp; exceptions</h2>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <ExportButtons
            filename="error_log"
            title="Error / exception log"
            subtitle={filtered.length === rows.length ? undefined : `${filtered.length} of ${rows.length} rows`}
            columns={[
              { key: 'createdAt', label: 'When', value: (r) => fmtTime(r.createdAt) },
              { key: 'level', label: 'Level' },
              { key: 'statusCode', label: 'Status', align: 'right' },
              { key: 'method', label: 'Method' },
              { key: 'path', label: 'Path' },
              { key: 'source', label: 'Source' },
              { key: 'message', label: 'Message' },
              { key: 'stack', label: 'Stack' },
              { key: 'context', label: 'Context' },
            ]}
            rows={filtered}
          />
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button className="btn btn-sm btn-danger" onClick={clear}>
            Clear all
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="form-row">
          <div>
            <label>Level</label>
            <select
              value={filters.level}
              onChange={(e) => setFilters({ ...filters, level: e.target.value })}
            >
              <option value="">All</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Source</label>
            <select
              value={filters.source}
              onChange={(e) => setFilters({ ...filters, source: e.target.value })}
            >
              <option value="">All</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label>From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
          <div>
            <label>Limit</label>
            <input
              type="number"
              min="50"
              max="5000"
              step="50"
              value={filters.limit}
              onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value) })}
            />
          </div>
          <div>
            <label>Quick search</label>
            <input
              value={search}
              placeholder="Search message, path, status…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card muted center">
          {rows.length === 0
            ? 'No errors logged. Nice.'
            : 'No rows match the filter.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>When</th>
                <th>Level</th>
                <th>Status</th>
                <th>Method</th>
                <th>Path</th>
                <th>Message</th>
                <th>Source</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {fmtTime(r.createdAt)}
                  </td>
                  <td>
                    <span className={`badge ${r.level === 'ERROR' ? 'badge-red' : 'badge-yellow'}`}>
                      {r.level}
                    </span>
                  </td>
                  <td className="num">{r.statusCode ?? '—'}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.method ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.path ?? '—'}</td>
                  <td>{r.message}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.source}</td>
                  <td>
                    {(r.stack || r.context) ? (
                      <details>
                        <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                          view
                        </summary>
                        {r.stack && (
                          <pre style={preStyle}>{r.stack}</pre>
                        )}
                        {r.context && (
                          <>
                            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>context</div>
                            <pre style={preStyle}>{pretty(r.context)}</pre>
                          </>
                        )}
                      </details>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const preStyle = {
  whiteSpace: 'pre-wrap',
  fontSize: 11,
  margin: '4px 0 0',
  color: 'var(--text-muted)',
  maxHeight: 240,
  overflow: 'auto',
};

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString();
}

function pretty(json) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return String(json);
  }
}
