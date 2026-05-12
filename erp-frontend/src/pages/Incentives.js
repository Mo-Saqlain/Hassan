import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

const tabs = [
  { key: 'progress', label: 'Targets & Progress' },
  { key: 'targets', label: 'Manage Targets' },
  { key: 'awards', label: 'Booked Awards' },
];

export default function Incentives() {
  const [tab, setTab] = useState('progress');
  return (
    <>
      <div className="page-header">
        <h2>Incentives</h2>
      </div>
      <div className="report-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`report-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'progress' && <ProgressPanel />}
      {tab === 'targets' && <TargetsPanel />}
      {tab === 'awards' && <AwardsPanel />}
    </>
  );
}

function ProgressPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/incentives/targets/progress');
      setRows(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="muted">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (rows.length === 0)
    return (
      <div className="card muted center" style={{ marginTop: 12 }}>
        No incentive targets set yet. Add one under "Manage Targets".
      </div>
    );

  return (
    <table style={{ marginTop: 12 }}>
      <thead>
        <tr>
          <th>Target</th>
          <th>Basis</th>
          <th>Period</th>
          <th className="right">Target Qty</th>
          <th className="right">Net Sold</th>
          <th className="right">Progress</th>
          <th className="right">Incentive</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const t = r.target;
          return (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>
                {t.basis === 'ITEM'
                  ? t.item?.name ?? '—'
                  : t.brand?.name ?? '—'}
              </td>
              <td>
                {t.periodStart} → {t.periodEnd}
              </td>
              <td className="right">{r.targetQuantity}</td>
              <td className="right">{r.netQuantity}</td>
              <td className="right">
                <div
                  style={{
                    display: 'inline-block',
                    width: 100,
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--border)',
                    overflow: 'hidden',
                    verticalAlign: 'middle',
                  }}
                >
                  <div
                    style={{
                      width: `${r.progressPct}%`,
                      height: '100%',
                      background: r.achieved
                        ? 'var(--tile-customers)'
                        : 'var(--primary)',
                    }}
                  />
                </div>
                <span style={{ marginLeft: 8 }}>{r.progressPct}%</span>
              </td>
              <td className="right">
                {Number(r.potentialIncentive).toFixed(2)}
              </td>
              <td>
                <span
                  className={`badge ${
                    r.achieved ? 'badge-green' : 'badge-gray'
                  }`}
                >
                  {r.achieved ? '✔ Achieved' : `${r.remaining} to go`}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TargetsPanel() {
  const { data: targets, loading, error, reload } = useResource(
    '/incentives/targets',
  );
  const { data: items } = useResource('/items');
  const { data: brands } = useResource('/brands');
  const { data: suppliers } = useResource('/suppliers');

  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankTarget());
  const [submitErr, setSubmitErr] = useState(null);

  const startAdd = () => {
    setEditing(null);
    setForm(blankTarget());
    setSubmitErr(null);
    setShow(true);
  };

  const startEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name,
      basis: t.basis,
      itemId: t.itemId ?? '',
      brandId: t.brandId ?? '',
      supplierId: t.supplierId ?? '',
      periodStart: t.periodStart,
      periodEnd: t.periodEnd,
      targetQuantity: t.targetQuantity,
      incentiveAmount: t.incentiveAmount,
      notes: t.notes ?? '',
      isActive: t.isActive,
    });
    setSubmitErr(null);
    setShow(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    const payload = {
      name: form.name.trim(),
      basis: form.basis,
      itemId: form.basis === 'ITEM' ? form.itemId || undefined : undefined,
      brandId: form.basis === 'BRAND' ? form.brandId || undefined : undefined,
      supplierId: form.supplierId || undefined,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
      targetQuantity: Number(form.targetQuantity),
      incentiveAmount: Number(form.incentiveAmount),
      notes: form.notes || undefined,
      isActive: form.isActive,
    };
    try {
      if (editing)
        await api.patch(`/incentives/targets/${editing.id}`, payload);
      else await api.post('/incentives/targets', payload);
      setShow(false);
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete target "${t.name}"?`)) return;
    try {
      await api.delete(`/incentives/targets/${t.id}`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    }
  };

  return (
    <>
      <div className="panel-header" style={{ marginTop: 12 }}>
        <h3>Incentive Targets</h3>
        <button className="btn btn-primary" onClick={startAdd}>
          + New Target
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {show && (
        <form className="card" onSubmit={submit}>
          <h4 style={{ marginTop: 0 }}>{editing ? 'Edit' : 'New'} Target</h4>
          {submitErr && <div className="alert alert-error">{submitErr}</div>}
          <div className="form-row">
            <div>
              <label>Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Q3 Inverter Push"
              />
            </div>
            <div>
              <label>Basis *</label>
              <select
                value={form.basis}
                onChange={(e) => setForm({ ...form, basis: e.target.value })}
              >
                <option value="ITEM">Specific Item</option>
                <option value="BRAND">Entire Brand</option>
              </select>
            </div>
            {form.basis === 'ITEM' ? (
              <div>
                <label>Item *</label>
                <select
                  required
                  value={form.itemId}
                  onChange={(e) =>
                    setForm({ ...form, itemId: e.target.value })
                  }
                >
                  <option value="">— Select —</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.sku})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label>Brand *</label>
                <select
                  required
                  value={form.brandId}
                  onChange={(e) =>
                    setForm({ ...form, brandId: e.target.value })
                  }
                >
                  <option value="">— Select —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label>Supplier (optional)</label>
              <select
                value={form.supplierId}
                onChange={(e) =>
                  setForm({ ...form, supplierId: e.target.value })
                }
              >
                <option value="">— None —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Period Start *</label>
              <input
                type="date"
                required
                value={form.periodStart}
                onChange={(e) =>
                  setForm({ ...form, periodStart: e.target.value })
                }
              />
            </div>
            <div>
              <label>Period End *</label>
              <input
                type="date"
                required
                value={form.periodEnd}
                onChange={(e) =>
                  setForm({ ...form, periodEnd: e.target.value })
                }
              />
            </div>
            <div>
              <label>Target Quantity *</label>
              <input
                type="number"
                step="1"
                min="1"
                required
                value={form.targetQuantity}
                onChange={(e) =>
                  setForm({ ...form, targetQuantity: e.target.value })
                }
              />
            </div>
            <div>
              <label>Incentive Amount *</label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={form.incentiveAmount}
                onChange={(e) =>
                  setForm({ ...form, incentiveAmount: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Selling at Rs.5000 loss is acceptable — Rs.8000 incentive unlocks at 50 units"
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
      ) : targets.length === 0 ? (
        <div className="card muted center">No targets yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Basis</th>
              <th>Period</th>
              <th className="right">Target Qty</th>
              <th className="right">Incentive</th>
              <th>Status</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>
                  {t.basis === 'ITEM'
                    ? t.item?.name ?? '—'
                    : t.brand?.name ?? '—'}
                </td>
                <td>
                  {t.periodStart} → {t.periodEnd}
                </td>
                <td className="right">{t.targetQuantity}</td>
                <td className="right">
                  {Number(t.incentiveAmount).toFixed(2)}
                </td>
                <td>
                  <span
                    className={`badge ${
                      t.isActive ? 'badge-green' : 'badge-gray'
                    }`}
                  >
                    {t.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="right">
                  <button className="btn btn-sm" onClick={() => startEdit(t)}>
                    Edit
                  </button>{' '}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => remove(t)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function AwardsPanel() {
  const { data: awards, loading, error, reload } = useResource('/incentives/awards');
  const { data: targets } = useResource('/incentives/targets');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(blankAward());
  const [submitErr, setSubmitErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    try {
      await api.post('/incentives/awards', {
        targetId: form.targetId || undefined,
        label: form.label.trim(),
        awardedOn: form.awardedOn,
        amount: Number(form.amount),
        periodStart: form.periodStart || undefined,
        periodEnd: form.periodEnd || undefined,
        notes: form.notes || undefined,
      });
      setShow(false);
      setForm(blankAward());
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete award "${a.label}"?`)) return;
    try {
      await api.delete(`/incentives/awards/${a.id}`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    }
  };

  const onTargetChange = (id) => {
    const t = targets.find((x) => x.id === id);
    setForm({
      ...form,
      targetId: id,
      label: t ? t.name : form.label,
      amount: t ? t.incentiveAmount : form.amount,
      periodStart: t ? t.periodStart : form.periodStart,
      periodEnd: t ? t.periodEnd : form.periodEnd,
    });
  };

  const total = awards.reduce((s, a) => s + Number(a.amount ?? 0), 0);

  return (
    <>
      <div className="panel-header" style={{ marginTop: 12 }}>
        <h3>Booked Incentive Awards</h3>
        <button className="btn btn-primary" onClick={() => setShow(true)}>
          + Book Award
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {show && (
        <form className="card" onSubmit={submit}>
          <h4 style={{ marginTop: 0 }}>Book Incentive Award</h4>
          {submitErr && <div className="alert alert-error">{submitErr}</div>}
          <div className="form-row">
            <div>
              <label>Linked Target (optional)</label>
              <select
                value={form.targetId}
                onChange={(e) => onTargetChange(e.target.value)}
              >
                <option value="">— None / one-off —</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.periodStart} → {t.periodEnd})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Label *</label>
              <input
                required
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Q3 Inverter Push payout"
              />
            </div>
            <div>
              <label>Awarded On *</label>
              <input
                type="date"
                required
                value={form.awardedOn}
                onChange={(e) =>
                  setForm({ ...form, awardedOn: e.target.value })
                }
              />
            </div>
            <div>
              <label>Amount *</label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label>Period Start</label>
              <input
                type="date"
                value={form.periodStart}
                onChange={(e) =>
                  setForm({ ...form, periodStart: e.target.value })
                }
              />
            </div>
            <div>
              <label>Period End</label>
              <input
                type="date"
                value={form.periodEnd}
                onChange={(e) =>
                  setForm({ ...form, periodEnd: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              Save Award
            </button>{' '}
            <button type="button" className="btn" onClick={() => setShow(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : awards.length === 0 ? (
        <div className="card muted center">No awards booked yet.</div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <strong>Total Booked:</strong>{' '}
            {total.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <table>
            <thead>
              <tr>
                <th>Awarded On</th>
                <th>Label</th>
                <th>Linked Target</th>
                <th>Period</th>
                <th className="right">Amount</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {awards.map((a) => (
                <tr key={a.id}>
                  <td>{a.awardedOn}</td>
                  <td>{a.label}</td>
                  <td>{a.target?.name ?? '—'}</td>
                  <td>
                    {a.periodStart && a.periodEnd
                      ? `${a.periodStart} → ${a.periodEnd}`
                      : '—'}
                  </td>
                  <td className="right">{Number(a.amount).toFixed(2)}</td>
                  <td className="right">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => remove(a)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function blankTarget() {
  const today = new Date().toISOString().slice(0, 10);
  const eom = new Date();
  eom.setMonth(eom.getMonth() + 1, 0);
  return {
    name: '',
    basis: 'ITEM',
    itemId: '',
    brandId: '',
    supplierId: '',
    periodStart: today,
    periodEnd: eom.toISOString().slice(0, 10),
    targetQuantity: '',
    incentiveAmount: '',
    notes: '',
    isActive: true,
  };
}

function blankAward() {
  return {
    targetId: '',
    label: '',
    awardedOn: new Date().toISOString().slice(0, 10),
    amount: '',
    periodStart: '',
    periodEnd: '',
    notes: '',
  };
}
