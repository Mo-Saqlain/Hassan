import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

/**
 * Booking Hold customer receipt. Printed at POS time for any sale where
 * dueAmount > 0 — the heavy red header warns the floor staff "do not let
 * this leave the shop until the balance is paid". The customer gets one
 * copy stapled to their receipt; the second goes home with the goods only
 * after settlement.
 *
 * Distinct from the normal sales receipt at /print/sale/:id — that one
 * has the warranty terms block and is the polished hand-over document.
 * This one is operational: balance pending, serials, due date, signature.
 */
export default function BookingReceiptPrint() {
  const { id } = useParams();
  const [sale, setSale] = useState(null);
  const [serials, setSerials] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/sales/${id}`)
      .then((r) => setSale(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load sale'));
  }, [id]);

  useEffect(() => {
    if (!sale?.invoiceNo) return;
    api
      .get(
        `/item-serials?saleInvoiceNo=${encodeURIComponent(sale.invoiceNo)}`,
      )
      .then((r) => setSerials(r.data ?? []))
      .catch(() => setSerials([]));
  }, [sale?.invoiceNo]);

  useEffect(() => {
    if (sale) {
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [sale]);

  if (error) {
    return (
      <div className="print-page">
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }
  if (!sale) return <div className="print-page muted">Loading…</div>;

  // First PENDING commitment date — what the customer promised to pay by.
  const nextPromise = (sale.paymentCommitments ?? []).find(
    (c) => c.status === 'PENDING',
  );

  return (
    <div className="print-page">
      <div className="booking-banner">
        ⚠ BOOKING HOLD — BALANCE PENDING ⚠
        <br />
        DO NOT ALLOW OUT OF THE SHOP UNTIL FINAL PAYMENT
      </div>

      <div className="print-header">
        <div>
          <h1>BOOKING RECEIPT</h1>
          <div className="muted">#{sale.invoiceNo}</div>
        </div>
        <div className="right">
          <div>
            <strong>Booked:</strong>{' '}
            {new Date(sale.createdAt).toLocaleString()}
          </div>
          {nextPromise && (
            <div>
              <strong>Balance due by:</strong>{' '}
              {new Date(nextPromise.dueDate).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      <div className="print-party">
        <div className="muted" style={{ fontSize: 12 }}>
          Customer
        </div>
        <div>
          <strong>{sale.customer?.name ?? 'Walk-in customer'}</strong>
        </div>
        {sale.customer?.phone && <div>{sale.customer.phone}</div>}
        {sale.customer?.address && <div>{sale.customer.address}</div>}
      </div>

      <table className="print-lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Serial(s)</th>
            <th className="right">Qty</th>
            <th className="right">Unit Price</th>
            <th className="right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {(sale.lines ?? []).map((ln, i) => {
            const lineSerials = serials.filter((s) => s.itemId === ln.itemId);
            return (
              <tr key={ln.id}>
                <td>{i + 1}</td>
                <td>
                  {ln.item?.name ?? ln.itemId}
                  {ln.item?.sku && (
                    <span className="muted"> ({ln.item.sku})</span>
                  )}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 10.5 }}>
                  {lineSerials.length === 0
                    ? '—'
                    : lineSerials.map((s) => s.serial).join(', ')}
                </td>
                <td className="right">{ln.quantity}</td>
                <td className="right">
                  {Number(ln.unitPrice).toFixed(2)}
                </td>
                <td className="right">
                  {Number(ln.lineTotal).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="print-totals">
        <div>
          <span>Subtotal:</span>{' '}
          <span>{Number(sale.totalAmount).toFixed(2)}</span>
        </div>
        <div>
          <span>Discount:</span>{' '}
          <span>{Number(sale.discount).toFixed(2)}</span>
        </div>
        <div className="bold">
          <span>Net total:</span>{' '}
          <span>{Number(sale.netAmount).toFixed(2)}</span>
        </div>
        <div>
          <span>Advance paid:</span>{' '}
          <span>{Number(sale.paidAmount).toFixed(2)}</span>
        </div>
        <div className="bold" style={{ color: '#c50f1f' }}>
          <span>BALANCE PENDING:</span>{' '}
          <span>{Number(sale.dueAmount).toFixed(2)}</span>
        </div>
      </div>

      {(sale.paymentCommitments ?? []).length > 0 && (
        <div className="booking-commitments">
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Payment schedule
          </div>
          <table className="warranty-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Due Date</th>
                <th className="right">Expected</th>
                <th className="right">Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sale.paymentCommitments.map((c, i) => (
                <tr key={i}>
                  <td>{new Date(c.dueDate).toLocaleDateString()}</td>
                  <td className="right">
                    {Number(c.expectedAmount).toFixed(2)}
                  </td>
                  <td className="right">
                    {Number(c.actualAmount ?? 0).toFixed(2)}
                  </td>
                  <td>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="booking-signatures">
        <div className="booking-sig-block">
          <div className="booking-sig-line">_____________________________</div>
          <div className="muted" style={{ fontSize: 11 }}>
            Customer signature
          </div>
        </div>
        <div className="booking-sig-block">
          <div className="booking-sig-line">_____________________________</div>
          <div className="muted" style={{ fontSize: 11 }}>
            Cashier signature
          </div>
        </div>
      </div>

      <div className="print-footer muted">
        Please bring this receipt and pay the balance by the scheduled date
        to take delivery of your unit. Goods cannot be released until the
        balance is cleared.
      </div>

      <div className="no-print" style={{ marginTop: 20 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>{' '}
        <button className="btn" onClick={() => window.close()}>
          Close
        </button>
      </div>
    </div>
  );
}
