import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

const STATUS_OPTIONS = [
  { value: 'PRESENT', label: '✓ Present', cls: 'chip-success' },
  { value: 'HALF_DAY', label: '½ Half day', cls: 'chip-warn' },
  { value: 'LEAVE', label: '○ Leave', cls: 'chip-info' },
  { value: 'ABSENT', label: '✕ Absent', cls: 'chip-danger' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const { data: employees } = useResource('/employees');
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/attendance?from=${date}&to=${date}`);
      setRows(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const byEmployee = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.employeeId, r);
    return m;
  }, [rows]);

  const mark = async (employeeId, status) => {
    setBusy(employeeId);
    try {
      await api.post('/attendance', { employeeId, date, status });
      load();
    } catch (err) {
      alert(err.uiMessage ?? 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const activeEmployees = (employees ?? []).filter((e) => e.isActive);

  const tally = STATUS_OPTIONS.reduce((acc, opt) => {
    acc[opt.value] = rows.filter((r) => r.status === opt.value).length;
    return acc;
  }, {});

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Attendance · {date}</h1>
          <p>Mark daily presence for each active employee.</p>
        </div>
        <div className="row">
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="chip chip-danger">{error}</div>}

      <div className="grid-stat" style={{ marginBottom: 18 }}>
        {STATUS_OPTIONS.map((s) => (
          <div className="stat" key={s.value}>
            <div className="stat-orb" style={{ '--stat-orb': '#a78bfa', opacity: 0.25 }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{tally[s.value] ?? 0}</div>
          </div>
        ))}
      </div>

      {activeEmployees.length === 0 ? (
        <div className="card muted center">
          No active employees yet. Add employees first under Catalogue → Employees.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Current status</th>
                <th>Mark</th>
              </tr>
            </thead>
            <tbody>
              {activeEmployees.map((emp) => {
                const row = byEmployee.get(emp.id);
                const cur = row?.status ?? null;
                const curOpt = STATUS_OPTIONS.find((s) => s.value === cur);
                return (
                  <tr key={emp.id}>
                    <td>
                      <strong>{emp.name}</strong>
                    </td>
                    <td>{emp.role ?? '—'}</td>
                    <td>
                      {curOpt ? (
                        <span className={`chip ${curOpt.cls}`}>{curOpt.label}</span>
                      ) : (
                        <span className="chip">— not marked —</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        {STATUS_OPTIONS.map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            className={
                              'btn btn-sm' +
                              (cur === s.value ? ' btn-primary' : '')
                            }
                            disabled={busy === emp.id}
                            onClick={() => mark(emp.id, s.value)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
