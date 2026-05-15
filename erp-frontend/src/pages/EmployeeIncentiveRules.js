import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';

const BASIS = [
  { value: 'ALL_SALES', label: 'All sales', needsRef: null },
  { value: 'CATEGORY', label: 'Sales of a category', needsRef: 'categories' },
  { value: 'ITEM', label: 'Sales of a specific item', needsRef: 'items' },
  { value: 'BRAND', label: 'Sales of a brand', needsRef: 'brands' },
];

export default function EmployeeIncentiveRules() {
  const { data: rules, reload, loading, error } = useResource('/employee-incentives/rules');
  const { data: employees } = useResource('/employees');
  const { data: items } = useResource('/items');
  const { data: categories } = useResource('/categories');
  const { data: brands } = useResource('/brands');

  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank());
  const [initialForm, setInitialForm] = useState(blank());
  const [submitErr, setSubmitErr] = useState(null);

  const isDirty = useMemo(
    () => show && JSON.stringify(form) !== JSON.stringify(initialForm),
    [show, form, initialForm],
  );
  useUnsavedChangesPrompt(isDirty);

  const open = (row) => {
    setEditing(row);
    const next = row
      ? {
          employeeId: row.employeeId,
          basis: row.basis,
          referenceId: row.referenceId ?? '',
          percentage: row.percentage ?? '',
          startsOn: row.startsOn ?? '',
          endsOn: row.endsOn ?? '',
          notes: row.notes ?? '',
          isActive: row.isActive ?? true,
        }
      : blank();
    setForm(next);
    setInitialForm(next);
    setSubmitErr(null);
    setShow(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    const payload = {
      employeeId: form.employeeId,
      basis: form.basis,
      referenceId: form.basis === 'ALL_SALES' ? undefined : form.referenceId,
      percentage: Number(form.percentage),
      startsOn: form.startsOn || undefined,
      endsOn: form.endsOn || undefined,
      notes: form.notes?.trim() || undefined,
      isActive: form.isActive,
    };
    try {
      if (editing) await api.patch(`/employee-incentives/rules/${editing.id}`, payload);
      else await api.post('/employee-incentives/rules', payload);
      setShow(false);
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (rule) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await api.delete(`/employee-incentives/rules/${rule.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  const refList = (basis) => {
    if (basis === 'CATEGORY') return categories;
    if (basis === 'ITEM') return items;
    if (basis === 'BRAND') return brands;
    return [];
  };
  const refName = (basis, id) => {
    const list = refList(basis);
    const found = list.find((r) => r.id === id);
    return found ? found.modelNo ?? found.name : '—';
  };

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Employee incentive rules</h1>
          <p>
            Percentage of qualifying sales credited to the employee's ledger.
            Multiple rules can apply to the same sale — they stack.
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => open(null)}>
          + New rule
        </button>
      </div>

      {error && <div className="chip chip-danger">{error}</div>}

      {show && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>{editing ? 'Edit rule' : 'New rule'}</h3>
          {submitErr && (
            <div className="chip chip-danger" style={{ marginBottom: 10 }}>
              {submitErr}
            </div>
          )}
          <div className="form-row">
            <div>
              <label>Employee *</label>
              <select
                className="select"
                required
                value={form.employeeId}
                onChange={(e) =>
                  setForm({ ...form, employeeId: e.target.value })
                }
              >
                <option value="">— Select —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Applies to *</label>
              <select
                className="select"
                value={form.basis}
                onChange={(e) =>
                  setForm({ ...form, basis: e.target.value, referenceId: '' })
                }
              >
                {BASIS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            {form.basis !== 'ALL_SALES' && (
              <div>
                <label>{BASIS.find((b) => b.value === form.basis)?.label} *</label>
                <select
                  className="select"
                  required
                  value={form.referenceId}
                  onChange={(e) =>
                    setForm({ ...form, referenceId: e.target.value })
                  }
                >
                  <option value="">— Select —</option>
                  {refList(form.basis).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.modelNo ?? r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label>Percentage of sale *</label>
              <input
                className="input"
                type="number"
                step="any"
                min="0"
                max="100"
                required
                value={form.percentage}
                placeholder="e.g. 2"
                onChange={(e) =>
                  setForm({ ...form, percentage: e.target.value })
                }
              />
            </div>
            <div>
              <label>Starts on</label>
              <input
                className="input"
                type="date"
                value={form.startsOn}
                onChange={(e) =>
                  setForm({ ...form, startsOn: e.target.value })
                }
              />
            </div>
            <div>
              <label>Ends on</label>
              <input
                className="input"
                type="date"
                value={form.endsOn}
                onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label>Notes</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Salesman bonus on inverter ACs"
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
              />
              Active
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Update' : 'Create'}
            </button>{' '}
            <button type="button" className="btn" onClick={() => setShow(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="card muted center">No rules yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Applies to</th>
                <th>Reference</th>
                <th className="num">Percentage</th>
                <th>Period</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={!r.isActive ? { opacity: 0.55 } : undefined}>
                  <td>
                    <strong>{r.employee?.name ?? '—'}</strong>
                  </td>
                  <td>{BASIS.find((b) => b.value === r.basis)?.label ?? r.basis}</td>
                  <td>
                    {r.basis === 'ALL_SALES' ? (
                      <span className="muted">—</span>
                    ) : (
                      refName(r.basis, r.referenceId)
                    )}
                  </td>
                  <td className="num">{Number(r.percentage).toFixed(2)}%</td>
                  <td>
                    {r.startsOn || r.endsOn ? (
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        {r.startsOn ?? '…'} → {r.endsOn ?? '…'}
                      </span>
                    ) : (
                      <span className="muted">always</span>
                    )}
                  </td>
                  <td>
                    <span className={`chip ${r.isActive ? 'chip-success' : ''}`}>
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="num">
                    <button className="btn btn-sm" onClick={() => open(r)}>
                      Edit
                    </button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>
                      Delete
                    </button>
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

function blank() {
  return {
    employeeId: '',
    basis: 'ALL_SALES',
    referenceId: '',
    percentage: '',
    startsOn: '',
    endsOn: '',
    notes: '',
    isActive: true,
  };
}
