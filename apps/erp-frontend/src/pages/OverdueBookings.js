import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * "Stuck bookings" recovery dashboard. Surfaces every sale where:
 *   - the customer paid a partial advance,
 *   - the unit is still physically in the shop (allocationStatus = BOOKED),
 *   - the booking is older than `minDays` (default 7) days.
 *
 * Release-to-Floor cancels the booking (reuses the existing reversal
 * pipeline) and flips the held serials back to AVAILABLE so the next
 * customer can buy them. The advance is NOT auto-refunded — it stays on
 * the customer's ledger as credit until the owner pays it back manually.
 */
export default function OverdueBookings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [minDays, setMinDays] = useState(7);
  const [pendingReleaseRow, setPendingReleaseRow] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async (days = minDays) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/sales/overdue-bookings?minDays=${days}`);
      setRows(r.data ?? []);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load overdue bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload(minDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const release = async () => {
    if (!pendingReleaseRow) return;
    setBusy(true);
    try {
      await api.post(
        `/sales/${pendingReleaseRow.saleId}/release-booking`,
        { reason: reason.trim() || undefined },
      );
      setPendingReleaseRow(null);
      setReason('');
      await reload(minDays);
    } catch (e) {
      setError(e.uiMessage ?? 'Release failed');
    } finally {
      setBusy(false);
    }
  };

  const fmtRs = (n) => `Rs ${Number(n ?? 0).toFixed(2)}`;
  const dayColor = (d) => {
    if (d >= 30) return 'var(--danger)';
    if (d >= 7) return 'var(--danger)';
    return 'var(--text-muted)';
  };

  return (
    <>
      <div className="page-header">
        <h2>Overdue Bookings</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Show bookings older than
          </label>
          <input
            type="number"
            min="0"
            value={minDays}
            onChange={(e) => setMinDays(Number(e.target.value || 0))}
            style={{ width: 60 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>days</span>
          <button className="btn btn-sm" onClick={() => reload(minDays)}>
            Refresh
          </button>
        </div>
      </div>

      <div
        className="alert"
        style={{
          background: 'var(--info-soft)',
          color: 'var(--info)',
          borderColor: 'var(--info)',
        }}
      >
        These customers paid an advance and never came back. The unit is
        still sitting in your hold zone. Releasing one cancels the booking
        and puts the unit back on the floor — the advance stays on the
        customer's ledger as credit.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card muted center">
          No bookings overdue by {minDays}+ days. All advances are recent or
          have been resolved.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Invoice</th>
              <th>Booked On</th>
              <th className="right">Days Held</th>
              <th>Units</th>
              <th className="right">Advance Paid</th>
              <th className="right">Remaining Due</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.saleId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.customerName}</div>
                  {r.customerPhone && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {r.customerPhone}
                    </div>
                  )}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{r.invoiceNo}</td>
                <td>{new Date(r.bookedOn).toLocaleDateString()}</td>
                <td
                  className="right"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: dayColor(r.daysElapsed),
                  }}
                >
                  {r.daysElapsed}d
                </td>
                <td>
                  {(r.serials ?? []).map((s) => (
                    <div
                      key={s.serial}
                      style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {s.itemName}{' '}
                      <span className="muted">· {s.serial}</span>
                    </div>
                  ))}
                </td>
                <td className="right">{fmtRs(r.paidSoFar)}</td>
                <td className="right">{fmtRs(r.remainingDue)}</td>
                <td className="right">
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 4,
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <a
                      className="btn btn-sm"
                      href={`#/print/box-tag/${r.saleId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Reprint the hold tag for the box on the warehouse floor"
                    >
                      Box Tag
                    </a>
                    <a
                      className="btn btn-sm"
                      href={`#/print/booking-receipt/${r.saleId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Reprint the customer's booking receipt"
                    >
                      Receipt
                    </a>
                    <button
                      className="btn btn-sm btn-warn"
                      onClick={() => {
                        setPendingReleaseRow(r);
                        setReason('');
                      }}
                    >
                      Release
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pendingReleaseRow && (
        <div className="modal-backdrop" onClick={() => !busy && setPendingReleaseRow(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500 }}
          >
            <h3 style={{ marginTop: 0 }}>Release booking?</h3>
            <p>
              You're about to release booking{' '}
              <strong>{pendingReleaseRow.invoiceNo}</strong> held by{' '}
              <strong>{pendingReleaseRow.customerName}</strong>. The
              following unit(s) will go back on the floor for any customer
              to buy:
            </p>
            <ul style={{ marginLeft: 16, fontFamily: 'var(--font-mono)' }}>
              {(pendingReleaseRow.serials ?? []).map((s) => (
                <li key={s.serial}>
                  {s.itemName} · {s.serial}
                </li>
              ))}
            </ul>
            {pendingReleaseRow.paidSoFar > 0 && (
              <div
                className="alert"
                style={{
                  background: 'var(--warning-soft)',
                  color: 'var(--warning)',
                  borderColor: 'var(--warning)',
                  fontSize: 13,
                }}
              >
                ⚠ Customer paid{' '}
                <strong>{fmtRs(pendingReleaseRow.paidSoFar)}</strong> as
                advance. This release does NOT auto-refund — the amount
                stays as customer credit. Refund manually via Customer →
                Receipts → Reverse if needed.
              </div>
            )}
            <label style={{ marginTop: 12 }}>Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. customer never came back"
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
                className="btn"
                disabled={busy}
                onClick={() => setPendingReleaseRow(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-warn"
                disabled={busy}
                onClick={release}
              >
                {busy ? 'Releasing…' : 'Release to Floor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
