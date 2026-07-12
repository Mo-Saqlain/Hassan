import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

/**
 * Box Hold Tag — a 4"x6" landscape sheet that the cashier prints alongside
 * the booking receipt and tapes directly to the physical appliance box on
 * the warehouse floor. Distinct from the customer-facing booking receipt:
 * this one stays with the goods, the customer takes the receipt.
 *
 * The "DO NOT SELL" watermark + bold customer name is deliberately ugly
 * and high-contrast — the goal is that any cashier walking past the box
 * sees the tag from across the room and knows to ignore that unit when
 * a fresh customer comes asking.
 */
export default function BoxTagPrint() {
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

  const nextPromise = (sale.paymentCommitments ?? []).find(
    (c) => c.status === 'PENDING',
  );
  const customerName = sale.customer?.name ?? 'Walk-in';

  return (
    <div className="box-tag-page">
      <div className="box-tag">
        <div className="box-tag-watermark" aria-hidden="true">
          DO&nbsp;NOT&nbsp;SELL
        </div>
        <div className="box-tag-header">⚠ RESERVED ITEM — DO NOT SELL ⚠</div>

        <div className="box-tag-grid">
          <div className="box-tag-label">Customer</div>
          <div className="box-tag-value box-tag-customer">
            {customerName}
          </div>

          {sale.customer?.phone && (
            <>
              <div className="box-tag-label">Phone</div>
              <div className="box-tag-value">{sale.customer.phone}</div>
            </>
          )}

          <div className="box-tag-label">Invoice #</div>
          <div className="box-tag-value">{sale.invoiceNo}</div>

          <div className="box-tag-label">Booked</div>
          <div className="box-tag-value">
            {new Date(sale.createdAt).toLocaleDateString()}
          </div>

          {nextPromise && (
            <>
              <div className="box-tag-label">Hold until</div>
              <div className="box-tag-value">
                {new Date(nextPromise.dueDate).toLocaleDateString()}
              </div>
            </>
          )}

          <div className="box-tag-label">Balance due</div>
          <div className="box-tag-value box-tag-amount">
            Rs {Number(sale.dueAmount).toFixed(2)}
          </div>
        </div>

        {serials.length > 0 && (
          <div className="box-tag-serials">
            <div className="box-tag-label" style={{ marginBottom: 4 }}>
              Serial(s)
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 14 }}>
              {serials.map((s) => (
                <div key={s.id}>
                  {s.item?.modelNo ?? s.item?.name ?? '—'} · {s.serial}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="box-tag-footer">
          TAPE THIS SLIP DIRECTLY TO THE BOX · CHECK WITH OFFICE BEFORE
          SELLING ANY UNIT WITH A TAG
        </div>
      </div>

      <div className="no-print" style={{ marginTop: 20, textAlign: 'center' }}>
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
