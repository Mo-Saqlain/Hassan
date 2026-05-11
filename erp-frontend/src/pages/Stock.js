import { useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

export default function Stock() {
  const { data: summary, loading, error, reload } = useResource('/stock/summary');
  const { data: items } = useResource('/items');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    itemId: '',
    type: 'IN',
    quantity: '',
    note: '',
  });
  const [submitError, setSubmitError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    try {
      await api.post('/stock/adjust', {
        itemId: form.itemId,
        type: form.type,
        quantity: Number(form.quantity),
        note: form.note || undefined,
      });
      setShowForm(false);
      setForm({ itemId: '', type: 'IN', quantity: '', note: '' });
      reload();
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Adjust failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Stock</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Adjust Stock
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>Manual Stock Adjustment</h3>
          {submitError && <div className="alert alert-error">{submitError}</div>}
          <div className="form-row">
            <div>
              <label>Item *</label>
              <select
                required
                value={form.itemId}
                onChange={(e) => setForm({ ...form, itemId: e.target.value })}
              >
                <option value="">— Select —</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.sku})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="IN">IN (Add)</option>
                <option value="OUT">OUT (Remove)</option>
              </select>
            </div>
            <div>
              <label>Quantity *</label>
              <input
                type="number"
                min="1"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div>
              <label>Note</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            Save
          </button>{' '}
          <button type="button" className="btn" onClick={() => setShowForm(false)}>
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : summary.length === 0 ? (
        <div className="card muted center">No stock data.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th className="right">On Hand</th>
              <th className="right">Min Level</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => {
              const low =
                row.minStockLevel > 0 && row.onHand < row.minStockLevel;
              return (
                <tr key={row.itemId}>
                  <td>{row.itemName}</td>
                  <td>{row.sku}</td>
                  <td className="right">{row.onHand}</td>
                  <td className="right">{row.minStockLevel}</td>
                  <td>
                    <span className={`badge ${low ? 'badge-red' : 'badge-green'}`}>
                      {low ? 'Low' : 'OK'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
