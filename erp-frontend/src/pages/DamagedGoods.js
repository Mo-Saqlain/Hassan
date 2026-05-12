import { useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import ExportButtons from '../components/ExportButtons';

const STATUS = [
  { value: 'DAMAGED', label: 'Damaged', chip: 'chip-danger' },
  { value: 'IN_REPAIR', label: 'In repair', chip: 'chip-warn' },
  { value: 'WRITE_OFF', label: 'Write-off', chip: 'chip-danger' },
  { value: 'REPAIRED', label: 'Repaired (returned to stock)', chip: 'chip-success' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function DamagedGoods() {
  const { data: rows, loading, error, reload } = useResource('/damaged-goods');
  const { data: items } = useResource('/items');
  const { data: stores } = useResource('/stores');

  const [show, setShow] = useState(false);
  const [form, setForm] = useState(blank());
  const [submitErr, setSubmitErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    try {
      await api.post('/damaged-goods', {
        itemId: form.itemId,
        storeId: form.storeId || undefined,
        quantity: Number(form.quantity),
        status: form.status,
        reportedOn: form.reportedOn,
        reason: form.reason || undefined,
        notes: form.notes || undefined,
      });
      setShow(false);
      setForm(blank());
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  const setStatus = async (row, status) => {
    if (!window.confirm(`Mark ${row.voucherNo} as ${status}?`)) return;
    try {
      await api.patch(`/damaged-goods/${row.id}/status`, { status });
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Update failed');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.voucherNo}?`)) return;
    try {
      await api.delete(`/damaged-goods/${row.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  // Tally cards.
  const tally = STATUS.reduce((acc, s) => {
    acc[s.value] = rows
      .filter((r) => r.status === s.value)
      .reduce((a, r) => a + Number(r.quantity), 0);
    return acc;
  }, {});

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Damaged goods</h1>
          <p>Track stock removed from sellable inventory — damaged, in repair, written off, or restored.</p>
        </div>
        <div className="row">
          <ExportButtons
            filename="damaged_goods"
            title="Damaged Goods"
            columns={[
              { key: 'voucherNo', label: 'Voucher' },
              { key: 'reportedOn', label: 'Reported on' },
              { key: 'item', label: 'Item', value: (r) => r.item?.modelNo ?? r.item?.name ?? '' },
              { key: 'store', label: 'Store', value: (r) => r.store?.name ?? '' },
              { key: 'quantity', label: 'Qty', align: 'right' },
              { key: 'status', label: 'Status' },
              { key: 'reason', label: 'Reason' },
            ]}
            rows={rows}
          />
          <button className="btn btn-sm btn-primary" onClick={() => setShow(true)}>
            + Report damage
          </button>
        </div>
      </div>

      {error && <div className="chip chip-danger">{error}</div>}

      <div className="grid-stat" style={{ marginBottom: 18 }}>
        {STATUS.map((s) => (
          <div className="stat" key={s.value}>
            <div className="stat-orb" style={{ '--stat-orb': '#fda4af', opacity: 0.25 }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{tally[s.value] ?? 0}</div>
          </div>
        ))}
      </div>

      {show && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>Report damaged stock</h3>
          {submitErr && (
            <div className="chip chip-danger" style={{ marginBottom: 10 }}>
              {submitErr}
            </div>
          )}
          <div className="form-row">
            <div>
              <label>Item *</label>
              <select
                className="select"
                required
                value={form.itemId}
                onChange={(e) => setForm({ ...form, itemId: e.target.value })}
              >
                <option value="">— Select —</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.modelNo ?? it.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Store</label>
              <select
                className="select"
                value={form.storeId}
                onChange={(e) => setForm({ ...form, storeId: e.target.value })}
              >
                <option value="">— Any —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Quantity *</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div>
              <label>Initial status *</label>
              <select
                className="select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="DAMAGED">Damaged</option>
                <option value="IN_REPAIR">In repair</option>
                <option value="WRITE_OFF">Write-off</option>
              </select>
            </div>
            <div>
              <label>Reported on</label>
              <input
                className="input"
                type="date"
                value={form.reportedOn}
                onChange={(e) => setForm({ ...form, reportedOn: e.target.value })}
              />
            </div>
            <div>
              <label>Reason</label>
              <input
                className="input"
                value={form.reason}
                placeholder="e.g. cracked screen, water damage"
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label>Notes</label>
            <textarea
              className="input"
              style={{ height: 'auto', padding: '10px 14px' }}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="chip chip-warn" style={{ marginTop: 10 }}>
            ⚠ Reporting damage immediately removes the quantity from sellable
            stock at the chosen store.
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">Save</button>{' '}
            <button type="button" className="btn" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card muted center">No damaged-goods records yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Reported</th>
                <th>Item</th>
                <th>Store</th>
                <th className="num">Qty</th>
                <th>Status</th>
                <th>Reason</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const opt = STATUS.find((s) => s.value === r.status);
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.voucherNo}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{r.reportedOn}</td>
                    <td>{r.item?.modelNo ?? r.item?.name ?? '—'}</td>
                    <td>{r.store?.name ?? '—'}</td>
                    <td className="num">{r.quantity}</td>
                    <td><span className={'chip ' + opt?.chip}>{opt?.label ?? r.status}</span></td>
                    <td>{r.reason ?? '—'}</td>
                    <td className="num">
                      {r.status === 'DAMAGED' && (
                        <button className="btn btn-sm" onClick={() => setStatus(r, 'IN_REPAIR')}>
                          Send to repair
                        </button>
                      )}{' '}
                      {(r.status === 'DAMAGED' || r.status === 'IN_REPAIR') && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => setStatus(r, 'REPAIRED')}>
                            Mark repaired
                          </button>{' '}
                          <button className="btn btn-sm" onClick={() => setStatus(r, 'WRITE_OFF')}>
                            Write-off
                          </button>
                        </>
                      )}{' '}
                      {r.status === 'REPAIRED' && (
                        <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>
                          Delete
                        </button>
                      )}
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

function blank() {
  return {
    itemId: '',
    storeId: '',
    quantity: 1,
    status: 'DAMAGED',
    reportedOn: todayStr(),
    reason: '',
    notes: '',
  };
}
