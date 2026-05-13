import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from '../components/ExportButtons';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE'];

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    entityType: '',
    action: '',
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
      if (filters.entityType) qs.set('entityType', filters.entityType);
      if (filters.action) qs.set('action', filters.action);
      if (filters.from) qs.set('from', `${filters.from}T00:00:00`);
      if (filters.to) qs.set('to', `${filters.to}T23:59:59`);
      if (filters.limit) qs.set('limit', String(filters.limit));
      const r = await api.get(`/audit-logs?${qs.toString()}`, {
        // bypass the small request-dedup cache so manual reload always re-fetches
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

  const entityTypes = useMemo(() => {
    const set = new Set(rows.map((r) => r.entityType).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.summary, r.entityType, r.entityId, r.action, r.source]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  return (
    <>
      <div className="page-header">
        <h2>Audit log</h2>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <ExportButtons
            filename="audit_log"
            title="Audit log"
            subtitle={filtered.length === rows.length ? undefined : `${filtered.length} of ${rows.length} rows`}
            columns={[
              { key: 'createdAt', label: 'When', value: (r) => fmtTime(r.createdAt) },
              { key: 'action', label: 'Action' },
              { key: 'entityType', label: 'Entity' },
              { key: 'summary', label: 'Summary' },
              { key: 'entityId', label: 'Entity ID' },
              { key: 'source', label: 'Source' },
              { key: 'changes', label: 'Changes' },
            ]}
            rows={filtered}
          />
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="form-row">
          <div>
            <label>Entity type</label>
            <select
              value={filters.entityType}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
            >
              <option value="">All</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Action</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            >
              <option value="">All</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
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
              placeholder="Search summary, ID, action…"
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
          {rows.length === 0 ? 'No audit entries yet.' : 'No rows match the filter.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Summary</th>
                <th>Source</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {fmtTime(r.createdAt)}
                  </td>
                  <td>
                    <span className={`badge ${actionBadge(r.action)}`}>{r.action}</span>
                  </td>
                  <td>{r.entityType}</td>
                  <td>{r.summary}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.source}</td>
                  <td>
                    {r.changes ? (
                      <details>
                        <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                          view
                        </summary>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            fontSize: 11,
                            margin: '4px 0 0',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {pretty(r.changes)}
                        </pre>
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

function actionBadge(action) {
  switch (action) {
    case 'CREATE': return 'badge-green';
    case 'UPDATE': return 'badge-blue';
    case 'DELETE': return 'badge-red';
    default: return 'badge-gray';
  }
}
