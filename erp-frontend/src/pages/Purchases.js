import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

const emptyLine = () => ({ itemId: '', quantity: 1, unitPrice: 0 });

export default function Purchases() {
  const { data: purchases, loading, error, reload } = useResource('/purchases');
  const { data: items } = useResource('/items');
  const { data: suppliers } = useResource('/suppliers');
  const { data: stores } = useResource('/stores');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    supplierId: '',
    storeId: '',
    discount: 0,
    paidAmount: '',
    paymentMethod: 'CASH',
    notes: '',
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
  const net = Math.max(0, total - Number(form.discount || 0));

  const updateLine = (idx, patch) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((ln, i) => (i === idx ? { ...ln, ...patch } : ln)),
    }));

  const onItemChange = (idx, itemId) => {
    const it = itemById.get(itemId);
    updateLine(idx, {
      itemId,
      unitPrice: it ? Number(it.purchasePrice) : 0,
    });
  };

  const addLine = () =>
    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (idx) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines,
    }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const payload = {
      supplierId: form.supplierId || undefined,
      storeId: form.storeId || undefined,
      discount: Number(form.discount) || 0,
      paidAmount: form.paidAmount === '' ? undefined : Number(form.paidAmount),
      paymentMethod: form.paymentMethod,
      notes: form.notes || undefined,
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
      await api.post('/purchases', payload);
      setShowForm(false);
      setForm({
        supplierId: '',
        storeId: '',
        discount: 0,
        paidAmount: '',
        paymentMethod: 'CASH',
        notes: '',
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
        <h2>Purchases</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New Purchase
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>New Purchase</h3>
          {submitError && <div className="alert alert-error">{submitError}</div>}
          <div className="form-row">
            <div>
              <label>Supplier</label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
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
              <label>Payment Method</label>
              <select
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm({ ...form, paymentMethod: e.target.value })
                }
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
                <option value="CREDIT">Credit</option>
              </select>
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
                      onClick={() => removeLine(idx)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn" onClick={addLine}>
            + Add Line
          </button>

          <div className="form-row" style={{ marginTop: 16 }}>
            <div>
              <label>Discount</label>
              <input
                type="number"
                step="any"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
            </div>
            <div>
              <label>Total</label>
              <input value={total.toFixed(2)} readOnly />
            </div>
            <div>
              <label>Net</label>
              <input value={net.toFixed(2)} readOnly />
            </div>
            <div>
              <label>Paid Amount</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={form.paidAmount}
                onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary">
            Save Purchase
          </button>{' '}
          <button type="button" className="btn" onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : purchases.length === 0 ? (
        <div className="card muted center">No purchases yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th className="right">Total</th>
              <th className="right">Net</th>
              <th className="right">Paid</th>
              <th className="right">Due</th>
              <th>Method</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td>{p.billNo}</td>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td>{p.supplier?.name ?? '—'}</td>
                <td className="right">{Number(p.totalAmount).toFixed(2)}</td>
                <td className="right">{Number(p.netAmount).toFixed(2)}</td>
                <td className="right">{Number(p.paidAmount).toFixed(2)}</td>
                <td className="right">{Number(p.dueAmount).toFixed(2)}</td>
                <td>{p.paymentMethod}</td>
                <td className="right">
                  <a
                    className="btn btn-sm"
                    href={`#/print/purchase/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Print
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
