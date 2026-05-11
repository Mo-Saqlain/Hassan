import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

const emptyLine = () => ({ itemId: '', quantity: 1, unitPrice: 0 });

export default function SaleReturns() {
  const { data: returns, loading, error, reload } = useResource('/sale-returns');
  const { data: items } = useResource('/items');
  const { data: customers } = useResource('/customers');
  const { data: stores } = useResource('/stores');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    storeId: '',
    saleId: '',
    reason: '',
    lines: [emptyLine()],
  });
  const [submitError, setSubmitError] = useState(null);

  const itemById = useMemo(() => {
    const m = new Map();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  const total = useMemo(
    () =>
      form.lines.reduce(
        (s, ln) => s + Number(ln.quantity ?? 0) * Number(ln.unitPrice ?? 0),
        0,
      ),
    [form.lines],
  );

  const updateLine = (idx, patch) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((ln, i) => (i === idx ? { ...ln, ...patch } : ln)),
    }));

  const onItemChange = (idx, itemId) => {
    const it = itemById.get(itemId);
    updateLine(idx, { itemId, unitPrice: it ? Number(it.salePrice) : 0 });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const payload = {
      customerId: form.customerId || undefined,
      storeId: form.storeId || undefined,
      saleId: form.saleId || undefined,
      reason: form.reason || undefined,
      lines: form.lines
        .filter((ln) => ln.itemId)
        .map((ln) => ({
          itemId: ln.itemId,
          quantity: Number(ln.quantity),
          unitPrice: Number(ln.unitPrice),
        })),
    };
    if (payload.lines.length === 0) {
      setSubmitError('At least one line is required');
      return;
    }
    try {
      await api.post('/sale-returns', payload);
      setShowForm(false);
      setForm({
        customerId: '',
        storeId: '',
        saleId: '',
        reason: '',
        lines: [emptyLine()],
      });
      reload();
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Save failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Sale Returns</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New Sale Return
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>New Sale Return</h3>
          {submitError && <div className="alert alert-error">{submitError}</div>}
          <div className="form-row">
            <div>
              <label>Customer</label>
              <select
                value={form.customerId}
                onChange={(e) =>
                  setForm({ ...form, customerId: e.target.value })
                }
              >
                <option value="">— None —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Store</label>
              <select
                value={form.storeId}
                onChange={(e) => setForm({ ...form, storeId: e.target.value })}
              >
                <option value="">— Default —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Reason</label>
              <input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>

          <table style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">Qty</th>
                <th className="right">Unit Price</th>
                <th className="right">Line Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((ln, idx) => (
                <tr key={idx}>
                  <td>
                    <select
                      value={ln.itemId}
                      onChange={(e) => onItemChange(idx, e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.sku})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={ln.quantity}
                      onChange={(e) =>
                        updateLine(idx, { quantity: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={ln.unitPrice}
                      onChange={(e) =>
                        updateLine(idx, { unitPrice: e.target.value })
                      }
                    />
                  </td>
                  <td className="right">
                    {(Number(ln.quantity) * Number(ln.unitPrice)).toFixed(2)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          lines:
                            f.lines.length > 1
                              ? f.lines.filter((_, i) => i !== idx)
                              : f.lines,
                        }))
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
            }
          >
            + Add Line
          </button>

          <div className="form-row" style={{ marginTop: 16 }}>
            <div>
              <label>Total Returned</label>
              <input value={total.toFixed(2)} readOnly />
            </div>
          </div>

          <button type="submit" className="btn btn-primary">
            Save Return
          </button>{' '}
          <button type="button" className="btn" onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : returns.length === 0 ? (
        <div className="card muted center">No sale returns yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Return #</th>
              <th>Date</th>
              <th>Customer</th>
              <th className="right">Total</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id}>
                <td>{r.returnNo}</td>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.customer?.name ?? '—'}</td>
                <td className="right">{Number(r.totalAmount).toFixed(2)}</td>
                <td>{r.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
