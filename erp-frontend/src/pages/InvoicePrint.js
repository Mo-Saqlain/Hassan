import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

/**
 * Renders the per-line warranty notice block on the printed receipt. The
 * shape of the block is driven by the item's warranty config (set in the
 * Items hub) — four mutually-exclusive branches:
 *
 *   1. hasWarranty === false               → "NO WARRANTY COVERAGE / SOLD AS-IS"
 *   2. warrantyType === 'CHECKING_ONLY'    → "No warranty. Item checked at
 *                                              time of sale."
 *   3. warrantyType === 'NONE'             → "No Warranty"
 *   4. warrantyType === 'COMPANY' | 'SHOP' → "Warranty: COMPANY · expires <date>"
 *                                              plus per-unit serial listing
 */
function LineWarrantyNotice({ item, serials, line }) {
  if (!item) return null;
  if (item.hasWarranty === false) {
    return (
      <div className="line-warranty line-no-warranty">
        ⚠ NO WARRANTY COVERAGE / SOLD AS-IS
      </div>
    );
  }
  if (item.warrantyType === 'CHECKING_ONLY') {
    return (
      <div className="line-warranty line-no-warranty">
        No warranty. Item checked at time of sale.
      </div>
    );
  }
  if (item.warrantyType === 'NONE') {
    return <div className="line-warranty line-no-warranty">No Warranty</div>;
  }
  // COMPANY / SHOP — show per-unit serial + expiry when serialised, or the
  // line-level expiry (frozen on the sale line at sale time) for model-only
  // items that have no serial to print. The line expiry is what the by-receipt
  // / by-customer / by-model warranty lookups resolve against later.
  const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');
  return (
    <div className="line-warranty line-has-warranty">
      <div>
        Warranty: {item.warrantyType}
        {item.warrantyDays ? ` · ${item.warrantyDays} days` : ''}
        {serials.length === 0 && line?.warrantyEndAt
          ? ` · expires ${fmt(line.warrantyEndAt)}`
          : ''}
      </div>
      {serials.length > 0 && (
        <ul className="line-serials">
          {serials.map((s) => (
            <li key={s.id}>
              {s.serial}
              {s.warrantyEndAt ? ` — expires ${fmt(s.warrantyEndAt)}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** True if ANY sold line carries real warranty cover (COMPANY or SHOP). */
function hasAnyWarrantyCover(sale, serials) {
  for (const ln of sale.lines ?? []) {
    if (!ln.item) continue;
    if (ln.item.hasWarranty === false) continue;
    if (ln.item.warrantyType === 'COMPANY' || ln.item.warrantyType === 'SHOP') {
      return true;
    }
    if (serials.some((s) => s.itemId === ln.itemId && s.warrantyEndAt)) {
      return true;
    }
  }
  return false;
}

export default function InvoicePrint({ type }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [serials, setSerials] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const path = type === 'sale' ? '/sales' : '/purchases';
    api
      .get(`${path}/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load'));
  }, [id, type]);

  // After the sale loads, fetch any serials sold against this invoice so the
  // warranty block renders the actual unit identifiers customers can quote
  // when claiming warranty. Purchases never produce warranties for the buyer,
  // so this is sale-only.
  useEffect(() => {
    if (type !== 'sale' || !data?.invoiceNo) return;
    api
      .get(`/item-serials?saleInvoiceNo=${encodeURIComponent(data.invoiceNo)}`)
      .then((r) => setSerials(r.data ?? []))
      .catch(() => setSerials([]));
  }, [type, data?.invoiceNo]);

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
  // Heads-up at the very top of the receipt when the sale isn't fully
  // paid yet. Distinct from the dedicated /print/booking-receipt route:
  // that one is the heavy customer-signed hold document, this is just a
  // banner on the normal sales invoice so a reprint mid-balance still
  // makes the status obvious.
  const isBookingHold = isSale && Number(data.dueAmount ?? 0) > 0.005;
  const docTitle = isSale
    ? isBookingHold
      ? 'SALES INVOICE · BOOKING HOLD'
      : 'SALES INVOICE'
    : 'PURCHASE BILL';

  return (
    <div className="print-page">
      {isBookingHold && (
        <div className="booking-banner">
          ⚠ BALANCE PENDING — DO NOT RELEASE GOODS UNTIL FINAL PAYMENT ⚠
        </div>
      )}
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
          {(data.lines ?? []).map((ln, i) => {
            const lineSerials = serials.filter(
              (s) => s.itemId === ln.itemId,
            );
            return (
              <tr key={ln.id}>
                <td>{i + 1}</td>
                <td>
                  {ln.item?.name ?? ln.itemId}
                  {ln.item?.sku && (
                    <span className="muted"> ({ln.item.sku})</span>
                  )}
                  {isSale && (
                    <LineWarrantyNotice
                      item={ln.item}
                      serials={lineSerials}
                      line={ln}
                    />
                  )}
                </td>
                <td className="right">{ln.quantity}</td>
                <td className="right">{Number(ln.unitPrice).toFixed(2)}</td>
                <td className="right">{Number(ln.lineTotal).toFixed(2)}</td>
              </tr>
            );
          })}
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

      {isSale && hasAnyWarrantyCover(data, serials) && (
        <div className="print-warranty">
          <div className="warranty-title">Warranty Terms &amp; Conditions</div>
          <ol className="warranty-terms">
            <li>
              Warranty covers manufacturing defects only. Physical damage,
              water damage, voltage surges, and unauthorised repairs void the
              warranty.
            </li>
            <li>
              Bring this receipt and the original packaging when claiming
              warranty. Quote the serial number printed under the item line.
            </li>
            <li>
              Warranty is non-transferable. The unit is covered for the
              original purchaser only.
            </li>
            <li>
              Walk-in customers can check live warranty status by scanning
              the serial number on this receipt at the shop counter.
            </li>
          </ol>
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
