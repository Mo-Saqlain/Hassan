import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

/**
 * Single-serial label print page. Renders an HTML 2-inch × 1-inch sticker
 * with the shop name + a scannable Code-128 barcode + the serial text and
 * item name underneath. Triggers window.print() after the fetch resolves,
 * so opening this route in a new tab is a one-click print flow.
 *
 * Hardware: works on any printer that can print HTML. For thermal-label
 * sticker rolls, the CSS sets @page size 2in × 1in with zero margin so
 * the browser scales the content to fit. For an A4 dump (many labels in
 * a grid) we'd need a separate route — out of scope here.
 *
 * Barcode encoding: uses the jsbarcode-style approach via inline SVG. We
 * don't depend on the jsbarcode library yet — instead, we render the
 * serial in a monospace font next to a placeholder bar pattern. When/if
 * the owner buys a real thermal printer + barcode scanner, swapping in
 * jsbarcode is one component change.
 */
export default function SerialLabelPrint() {
  const { serial } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/item-serials/warranty/${encodeURIComponent(serial)}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load serial'));
  }, [serial]);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (error) {
    return (
      <div className="print-page">
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }
  if (!data) {
    return <div className="print-page muted">Loading…</div>;
  }

  return (
    <div className="serial-label-page">
      <div className="serial-label">
        <div className="serial-label-brand">HASSAN ELECTRONICS</div>
        <div className="serial-label-bars" aria-hidden="true">
          {serial.split('').map((c, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: 2,
                height: 26,
                background: '#000',
                marginRight: c.charCodeAt(0) % 3 === 0 ? 3 : 1,
              }}
            />
          ))}
        </div>
        <div className="serial-label-text">{serial}</div>
        <div className="serial-label-item">{data.modelNo ?? '—'}</div>
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
