import { useState } from 'react';
import { api } from '../api/client';

/**
 * Row-level reversal action for posted transactions (sales, purchases,
 * receipts, payments, fund transfers). The backend endpoint pattern is
 * `POST {endpoint}/:id/reverse` with body `{ reason }`. Idempotent — the
 * service short-circuits if `reversedAt` is already set.
 *
 * If the row is already reversed, renders a `chip-warn` "Reversed" chip
 * with the original reason in the title attribute. Otherwise renders a
 * `btn-warn` button that opens a small modal asking for the required
 * reason before calling the endpoint.
 *
 * Props:
 *   - endpoint: '/sales' | '/purchases' | '/payments' | '/fund-transfers'
 *   - row:      the document row (must carry `id`, `reversedAt`, `reversalReason`)
 *   - label:    optional — used in the modal heading ("Reverse sale INV-…")
 *   - onDone:   called after a successful reversal (typically `reload`)
 */
export default function ReverseAction({ endpoint, row, label, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (row.reversedAt) {
    return (
      <span
        className="chip chip-warn"
        title={
          row.reversalReason
            ? `Reversed: ${row.reversalReason}`
            : 'Reversed'
        }
      >
        Reversed
      </span>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`${endpoint}/${row.id}/reverse`, { reason: reason.trim() });
      setOpen(false);
      setReason('');
      if (onDone) onDone();
    } catch (e2) {
      setError(e2.uiMessage ?? 'Reverse failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-warn"
        onClick={() => setOpen(true)}
        title="Post a balancing reversal — the original row stays in history with a Reversed chip."
      >
        Reverse
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              Reverse {label ?? 'transaction'}?
            </h3>
            <p className="muted" style={{ fontSize: 13 }}>
              This posts a balancing entry that cancels out the original.
              The original row stays in history with a <strong>Reversed</strong>{' '}
              chip and is netted out by every ledger, the trial balance, and the
              financial statements. The action is idempotent.
            </p>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={submit}>
              <label>Reason *</label>
              <input
                autoFocus
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. wrong customer, duplicate entry, voided sale"
              />
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                  marginTop: 16,
                }}
              >
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-warn"
                  disabled={busy}
                >
                  {busy ? 'Reversing…' : 'Reverse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
