import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import ReverseAction from '../components/ReverseAction';

function ReleaseBookingButton({ saleId, onDone }) {
  const [busy, setBusy] = useState(false);
  const release = async () => {
    if (!window.confirm('Release booking for this sale? Held serials will be returned to floor.')) return;
    setBusy(true);
    try {
      await api.post(`/sales/${saleId}/release-booking`);
      alert('Booking released!');
      onDone();
    } catch (e) {
      alert(e.uiMessage ?? 'Failed to release booking');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className="btn btn-sm"
      onClick={release}
      disabled={busy}
      title="Cancel booking hold and release serials to floor"
      style={{ color: 'var(--warning, #c2410c)' }}
    >
      {busy ? 'Releasing…' : 'Release Hold'}
    </button>
  );
}

export default function Sales() {
  const { data: sales, loading, error, reload } = useResource('/sales');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(
      (s) =>
        s.invoiceNo?.toLowerCase().includes(q) ||
        s.customer?.name?.toLowerCase().includes(q) ||
        s.paymentMethod?.toLowerCase().includes(q),
    );
  }, [sales, search]);

  return (
    <>
      <div className="page-header">
        <h2>Sales History</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="Search invoice, customer, method..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
        </div>
      </div>

      <div className="alert" style={{ background: 'var(--info-soft)', color: 'var(--info)', borderColor: 'var(--info)' }}>
        Sales are created at the POS terminal. This page is a read-only history.
        For collections, use the <strong>Customer → Receipts</strong> tab — the{' '}
        <strong>Customer Ledger</strong> tab shows the net A/R balance per customer.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card muted center">
          {search ? 'No sales match your search.' : 'No sales yet.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th className="right">Total</th>
              <th className="right">Net</th>
              <th className="right">Paid at sale</th>
              <th>Method</th>
              <th>Promise</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.invoiceNo}</td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
                <td>{s.customer?.name ?? 'Walk-in'}</td>
                <td className="right">{Number(s.totalAmount).toFixed(2)}</td>
                <td className="right">{Number(s.netAmount).toFixed(2)}</td>
                <td className="right">{Number(s.paidAmount ?? 0).toFixed(2)}</td>
                <td>{s.paymentMethod}</td>
                <td>
                  {(() => {
                    // First PENDING commitment is the next thing the
                    // customer owes by a specific date. If they're already
                    // past it and still haven't paid in full, flag danger.
                    const next = (s.paymentCommitments ?? []).find(
                      (c) => c.status === 'PENDING',
                    );
                    if (!next) return '—';
                    const promise = new Date(next.dueDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const overdue = promise < today;
                    const promiseStr = promise.toLocaleDateString();
                    return (
                      <span
                        className={`chip ${overdue ? 'chip-danger' : 'chip-info'}`}
                        title={
                          overdue
                            ? `Promised by ${promiseStr} — overdue`
                            : `Promised by ${promiseStr}`
                        }
                      >
                        {overdue ? `Overdue · ${promiseStr}` : promiseStr}
                      </span>
                    );
                  })()}
                </td>
                <td className="right">
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Corrections open the Sales Voucher screen with this
                        invoice loaded — that's the only place a sale's shape
                        (lines, splits, schedule) is expressed, so the history
                        page stays read-only and doesn't grow a second form. */}
                    {!s.reversedAt && (
                      <Link
                        className="btn btn-sm"
                        to={`/sales-voucher?edit=${s.id}`}
                        title="Correct this invoice — keeps its number, re-issues its receipts"
                      >
                        Edit
                      </Link>
                    )}
                    <a
                      className="btn btn-sm"
                      href={`#/print/sale/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Print
                    </a>
                    {Number(s.dueAmount) > 0 && (
                      <>
                        <a
                          className="btn btn-sm"
                          href={`#/print/booking-receipt/${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Booking hold receipt (red header, customer signature)"
                        >
                          Hold Slip
                        </a>
                        <a
                          className="btn btn-sm"
                          href={`#/print/box-tag/${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="4×6 box tag — tape to the physical unit"
                        >
                          Box Tag
                        </a>
                        {!s.reversedAt && (
                          <ReleaseBookingButton saleId={s.id} onDone={reload} />
                        )}
                      </>
                    )}
                    <ReverseAction
                      endpoint="/sales"
                      row={s}
                      label={`sale ${s.invoiceNo}`}
                      onDone={reload}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
