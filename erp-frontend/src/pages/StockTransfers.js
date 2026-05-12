import { useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import ExportButtons from '../components/ExportButtons';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function StockTransfers() {
  const { data: transfers, loading, error, reload } = useResource('/stock-transfers');
  const { data: stores } = useResource('/stores');
  const { data: items } = useResource('/items');

  const [show, setShow] = useState(false);
  const [form, setForm] = useState(blank());
  const [submitErr, setSubmitErr] = useState(null);

  const updateLine = (idx, patch) => {
    setForm({
      ...form,
      lines: form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    });
  };
  const addLine = () => {
    setForm({ ...form, lines: [...form.lines, { itemId: '', quantity: 1 }] });
  };
  const removeLine = (idx) => {
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    if (form.fromStoreId === form.toStoreId) {
      setSubmitErr('Source and destination stores must differ');
      return;
    }
    const validLines = form.lines.filter(
      (l) => l.itemId && Number(l.quantity) > 0,
    );
    if (validLines.length === 0) {
      setSubmitErr('Add at least one item with quantity');
      return;
    }
    try {
      await api.post('/stock-transfers', {
        fromStoreId: form.fromStoreId,
        toStoreId: form.toStoreId,
        transferDate: form.transferDate,
        notes: form.notes || undefined,
        lines: validLines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
        })),
      });
      setShow(false);
      setForm(blank());
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Stock transfers</h1>
          <p>Move inventory between stores. Each transfer is atomic — OUT from source, IN to destination, or nothing.</p>
        </div>
        <div className="row">
          <ExportButtons
            filename="stock_transfers"
            title="Stock Transfers"
            columns={[
              { key: 'transferNo', label: 'Transfer #' },
              { key: 'transferDate', label: 'Date' },
              { key: 'fromStore', label: 'From', value: (r) => r.fromStore?.name ?? '' },
              { key: 'toStore', label: 'To', value: (r) => r.toStore?.name ?? '' },
              { key: 'lines', label: 'Items', value: (r) => (r.lines ?? []).length },
              { key: 'notes', label: 'Notes' },
            ]}
            rows={transfers}
          />
          <button className="btn btn-sm btn-primary" onClick={() => setShow(true)} disabled={(stores ?? []).length < 2}>
            + New transfer
          </button>
        </div>
      </div>

      {(stores ?? []).length < 2 && (
        <div className="chip chip-warn">
          Stock transfers need at least two stores. Add another store first.
        </div>
      )}

      {error && <div className="chip chip-danger">{error}</div>}

      {show && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>New stock transfer</h3>
          {submitErr && (
            <div className="chip chip-danger" style={{ marginBottom: 10 }}>
              {submitErr}
            </div>
          )}
          <div className="form-row">
            <div>
              <label>From store *</label>
              <select
                className="select"
                required
                value={form.fromStoreId}
                onChange={(e) => setForm({ ...form, fromStoreId: e.target.value })}
              >
                <option value="">— Select —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>To store *</label>
              <select
                className="select"
                required
                value={form.toStoreId}
                onChange={(e) => setForm({ ...form, toStoreId: e.target.value })}
              >
                <option value="">— Select —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Date</label>
              <input
                className="input"
                type="date"
                value={form.transferDate}
                onChange={(e) => setForm({ ...form, transferDate: e.target.value })}
              />
            </div>
          </div>

          <h4 style={{ marginTop: 8 }}>Items</h4>
          <div className="table-wrap" style={{ marginBottom: 8 }}>
            <table className="t">
              <thead>
                <tr><th>Item</th><th className="num">Quantity</th><th></th></tr>
              </thead>
              <tbody>
                {form.lines.map((ln, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        className="select"
                        value={ln.itemId}
                        onChange={(e) => updateLine(idx, { itemId: e.target.value })}
                      >
                        <option value="">— Select —</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>{it.modelNo ?? it.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        className="input"
                        type="number"
                        min="1"
                        step="1"
                        value={ln.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td className="num">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeLine(idx)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-sm" onClick={addLine}>+ Add line</button>

          <div style={{ marginTop: 10 }}>
            <label>Notes</label>
            <textarea
              className="input"
              style={{ height: 'auto', padding: '10px 14px' }}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">Save transfer</button>{' '}
            <button type="button" className="btn" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : transfers.length === 0 ? (
        <div className="card muted center">No stock transfers yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th className="num">Items</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{t.transferNo}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{t.transferDate}</td>
                  <td>{t.fromStore?.name ?? '—'}</td>
                  <td>{t.toStore?.name ?? '—'}</td>
                  <td className="num">{(t.lines ?? []).length}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{t.notes ?? '—'}</td>
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
    fromStoreId: '',
    toStoreId: '',
    transferDate: todayStr(),
    notes: '',
    lines: [{ itemId: '', quantity: 1 }],
  };
}
