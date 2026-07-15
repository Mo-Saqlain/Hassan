import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';

/**
 * Physical stocktake. Count the shelf, type the counted quantity next to each
 * item, and post — the backend snapshots system on-hand, computes the variance
 * per item, and posts one ADJUSTMENT movement per difference under a shared
 * reference. Items you leave blank are untouched, so you can count part of the
 * shop at a time.
 *
 * System on-hand already reflects everything sold (including booked units,
 * deducted at sale time). Count only what's physically unsold on the shelf.
 */
export default function Stocktake() {
  const { data: items, loading, error } = useResource('/items');
  const { data: summary, reload: reloadSummary } = useResource('/stock/summary');

  const [counts, setCounts] = useState({}); // { itemId: '3' }
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [posting, setPosting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const onHandById = useMemo(() => {
    const m = new Map();
    for (const r of summary ?? []) m.set(r.itemId, Number(r.onHand ?? 0));
    return m;
  }, [summary]);

  const rows = useMemo(() => {
    const list = (items ?? [])
      .filter((it) => it.isActive !== false)
      .map((it) => ({
        id: it.id,
        name: it.name,
        sku: it.sku,
        onHand: onHandById.get(it.id) ?? 0,
      }));
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.sku ?? '').toLowerCase().includes(term),
    );
  }, [items, onHandById, query]);

  const enteredCount = useMemo(
    () => Object.values(counts).filter((v) => v !== '' && v != null).length,
    [counts],
  );
  useUnsavedChangesPrompt(enteredCount > 0 && !result);

  const setCount = (itemId, value) =>
    setCounts((c) => ({ ...c, [itemId]: value }));

  const submit = async () => {
    setSubmitError(null);
    const lines = Object.entries(counts)
      .filter(([, v]) => v !== '' && v != null)
      .map(([itemId, v]) => ({ itemId, countedQty: Math.trunc(Number(v)) }));
    if (lines.length === 0) {
      setSubmitError('Enter a counted quantity for at least one item.');
      return;
    }
    if (lines.some((l) => !Number.isFinite(l.countedQty) || l.countedQty < 0)) {
      setSubmitError('Counted quantities must be whole numbers of 0 or more.');
      return;
    }
    if (
      !window.confirm(
        `Post stocktake for ${lines.length} item(s)? Variances will adjust stock and cannot be un-done except by another adjustment.`,
      )
    ) {
      return;
    }
    setPosting(true);
    try {
      const r = await api.post('/stock/stocktake', { lines });
      setResult(r.data);
      setCounts({});
      reloadSummary();
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Stocktake failed');
    } finally {
      setPosting(false);
    }
  };

  const startNew = () => {
    setResult(null);
    setCounts({});
    setQuery('');
    setSubmitError(null);
  };

  if (result) {
    const varianceRows = result.lines.filter((l) => l.variance !== 0);
    return (
      <>
        <div className="page-header">
          <h2>Stocktake posted · {result.reference}</h2>
          <button className="btn btn-primary" onClick={startNew}>
            + New count
          </button>
        </div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <Stat label="Items counted" value={result.countedLines} />
            <Stat label="Variances applied" value={result.varianceLines} />
            <Stat
              label="Net units"
              value={result.netUnits > 0 ? `+${result.netUnits}` : result.netUnits}
              tone={result.netUnits === 0 ? undefined : result.netUnits > 0 ? 'pos' : 'neg'}
            />
          </div>
        </div>
        {varianceRows.length === 0 ? (
          <div className="card muted center">
            No variances — every counted item matched the system. 🎉
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">System</th>
                <th className="right">Counted</th>
                <th className="right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {varianceRows.map((l) => (
                <tr key={l.itemId}>
                  <td>{l.itemName}</td>
                  <td className="right mono">{l.systemQty}</td>
                  <td className="right mono">{l.countedQty}</td>
                  <td className="right mono">
                    <span className={l.variance > 0 ? 'chip chip-success' : 'chip chip-danger'}>
                      {l.variance > 0 ? `+${l.variance}` : l.variance}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>Stocktake</h2>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={posting || enteredCount === 0}
        >
          {posting ? 'Posting…' : `Post count (${enteredCount})`}
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Type the counted quantity next to each item you check. Blank = not
        counted (left untouched). Variances post as stock adjustments.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {submitError && <div className="alert alert-error">{submitError}</div>}

      <div style={{ margin: '10px 0' }}>
        <input
          className="input"
          placeholder="Search item or SKU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card muted center">No items.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th className="right">System on-hand</th>
              <th className="right">Counted</th>
              <th className="right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const raw = counts[r.id];
              const hasCount = raw !== '' && raw != null;
              const variance = hasCount ? Math.trunc(Number(raw)) - r.onHand : null;
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="mono">{r.sku}</td>
                  <td className="right mono">{r.onHand}</td>
                  <td className="right">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={raw ?? ''}
                      onChange={(e) => setCount(r.id, e.target.value)}
                      style={{ width: 90, textAlign: 'right' }}
                    />
                  </td>
                  <td className="right mono">
                    {variance == null || variance === 0 ? (
                      variance === 0 ? '0' : '—'
                    ) : (
                      <span className={variance > 0 ? 'chip chip-success' : 'chip chip-danger'}>
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    )}
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

function Stat({ label, value, tone }) {
  const color =
    tone === 'neg'
      ? 'var(--danger, #ef4444)'
      : tone === 'pos'
        ? 'var(--success, #16a34a)'
        : undefined;
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color }}>
        {value}
      </div>
    </div>
  );
}
