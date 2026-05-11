import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

export default function InvoicePrint({ type }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const path = type === 'sale' ? '/sales' : '/purchases';
    api
      .get(`${path}/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load'));
  }, [id, type]);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (error) return <div className="print-page"><div className="alert alert-error">{error}</div></div>;
  if (!data) return <div className="print-page muted">Loading…</div>;

  const isSale = type === 'sale';
  const number = isSale ? data.invoiceNo : data.billNo;
  const party = isSale ? data.customer : data.supplier;
  const partyLabel = isSale ? 'Bill To' : 'Supplier';
  const docTitle = isSale ? 'SALES INVOICE' : 'PURCHASE BILL';

  return (
    <div className="print-page">
      <div className="print-header">
        <div>
          <h1>{docTitle}</h1>
          <div className="muted">#{number}</div>
        </div>
        <div className="right">
          <div><strong>Date:</strong> {new Date(data.createdAt).toLocaleString()}</div>
          {data.store?.name && (
            <div><strong>Store:</strong> {data.store.name}</div>
          )}
        </div>
      </div>

      <div className="print-party">
        <div className="muted" style={{ fontSize: 12 }}>{partyLabel}</div>
        <div><strong>{party?.name ?? (isSale ? 'Walk-in customer' : '—')}</strong></div>
        {party?.phone && <div>{party.phone}</div>}
        {party?.email && <div>{party.email}</div>}
        {party?.address && <div>{party.address}</div>}
      </div>

      <table className="print-lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="right">Qty</th>
            <th className="right">Unit Price</th>
            <th className="right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {(data.lines ?? []).map((ln, i) => (
            <tr key={ln.id}>
              <td>{i + 1}</td>
              <td>
                {ln.item?.name ?? ln.itemId}
                {ln.item?.sku && <span className="muted"> ({ln.item.sku})</span>}
              </td>
              <td className="right">{ln.quantity}</td>
              <td className="right">{Number(ln.unitPrice).toFixed(2)}</td>
              <td className="right">{Number(ln.lineTotal).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-totals">
        <div><span>Subtotal:</span> <span>{Number(data.totalAmount).toFixed(2)}</span></div>
        <div><span>Discount:</span> <span>{Number(data.discount).toFixed(2)}</span></div>
        <div className="bold"><span>Net:</span> <span>{Number(data.netAmount).toFixed(2)}</span></div>
        <div><span>Paid:</span> <span>{Number(data.paidAmount).toFixed(2)}</span></div>
        <div className={Number(data.dueAmount) > 0 ? 'bold' : ''}>
          <span>Due:</span> <span>{Number(data.dueAmount).toFixed(2)}</span>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          Payment: {data.paymentMethod}
        </div>
      </div>

      {data.notes && (
        <div className="print-notes">
          <div className="muted" style={{ fontSize: 12 }}>Notes</div>
          <div>{data.notes}</div>
        </div>
      )}

      <div className="print-footer muted">Thank you for your business.</div>

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
