import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

/**
 * Reasons → direction. The user picks the reason; the IN/OUT direction
 * follows automatically. This makes it impossible to accidentally ADD 10
 * stock while trying to write off 10 losses (which has bitten us before).
 */
const REASONS = [
  { value: 'LOSS', label: 'Loss / stolen / missing', direction: 'OUT' },
  { value: 'DAMAGED', label: 'Damaged / unsellable', direction: 'OUT' },
  { value: 'COUNT_DOWN', label: 'Stock count — was over', direction: 'OUT' },
  { value: 'FOUND', label: 'Found / mis-shelved', direction: 'IN' },
  { value: 'COUNT_UP', label: 'Stock count — was under', direction: 'IN' },
  { value: 'CORRECTION_IN', label: 'Correction (add)', direction: 'IN' },
  { value: 'CORRECTION_OUT', label: 'Correction (remove)', direction: 'OUT' },
];

export default function Stock() {
  const { data: summary, loading, error, reload } = useResource('/stock/summary');
  const { data: items } = useResource('/items');

  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return summary;
    return summary.filter((r) =>
      [r.itemName, r.sku]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [summary, query]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [submitError, setSubmitError] = useState(null);

  // Look up the selected item's on-hand from the cached summary so we can
  // show "after adjustment" preview without an extra API round-trip.
  const selectedSummary = summary.find((s) => s.itemId === form.itemId);
  const onHand = selectedSummary ? Number(selectedSummary.onHand) : null;
  const reason = REASONS.find((r) => r.value === form.reason);
  const direction = reason?.direction;
  const qtyNum = Number(form.quantity) || 0;
  const projected =
    onHand == null || !direction || !qtyNum
      ? null
      : direction === 'IN'
      ? onHand + qtyNum
      : onHand - qtyNum;
  const wouldGoNegative = direction === 'OUT' && projected !== null && projected < 0;

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.itemId) {
      setSubmitError('Please select an item.');
      return;
    }
    if (!reason) {
      setSubmitError('Please pick a reason — it determines whether to add or remove stock.');
      return;
    }
    if (!qtyNum || qtyNum < 1) {
      setSubmitError('Quantity must be at least 1.');
      return;
    }
    if (wouldGoNegative) {
      setSubmitError(
        `This would drive stock negative (currently ${onHand}). Please re-check the quantity.`,
      );
      return;
    }
    const note = form.note
      ? `${reason.label}: ${form.note}`
      : reason.label;
    try {
      await api.post('/stock/adjust', {
        itemId: form.itemId,
        type: direction,
        quantity: qtyNum,
        note,
      });
      setShowForm(false);
      setForm(blankForm());
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

      <div className="card" style={{ marginBottom: 12 }}>
        <label>Quick search</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by item name or SKU…"
        />
        {query.trim() && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </div>
        )}
      </div>

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
                    {i.modelNo ?? i.name} ({i.sku})
                  </option>
                ))}
              </select>
              {onHand != null && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Currently on hand: <strong>{onHand}</strong>
                </div>
              )}
            </div>
            <div>
              <label>Reason *</label>
              <select
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              >
                <option value="">— Why is the count changing? —</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} ({r.direction === 'IN' ? '+' : '−'})
                  </option>
                ))}
              </select>
              {direction && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  This is a stock{' '}
                  <strong style={{ color: direction === 'OUT' ? 'var(--danger)' : 'var(--success)' }}>
                    {direction}
                  </strong>{' '}
                  movement.
                </div>
              )}
            </div>
            <div>
              <label>Quantity *</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
              {projected !== null && (
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    color: wouldGoNegative ? 'var(--danger)' : undefined,
                  }}
                >
                  After adjustment: <strong>{projected}</strong>
                </div>
              )}
            </div>
            <div>
              <label>Extra note</label>
              <input
                value={form.note}
                placeholder="optional — e.g. unit 3 had a cracked screen"
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>

          {wouldGoNegative && (
            <div className="alert alert-error">
              This would push on-hand below zero. Either reduce the quantity or
              pick a different reason.
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={wouldGoNegative || !direction || !qtyNum}
            >
              Save Adjustment
            </button>{' '}
            <button type="button" className="btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card muted center">
          {query.trim() ? 'No stock items match your search.' : 'No stock data.'}
        </div>
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
            {filtered.map((row) => {
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

function blankForm() {
  return { itemId: '', reason: '', quantity: '', note: '' };
}
