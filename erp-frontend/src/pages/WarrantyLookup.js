import { useState } from 'react';
import { api } from '../api/client';

/**
 * Counter-friendly warranty lookup. The salesman types or scans the serial
 * from the appliance label and the page resolves it to the sold-unit record
 * — model, sold-on date, warranty expiry, "still under warranty?" flag.
 *
 * Backed by `GET /api/item-serials/warranty/:serial` (marked @Public on the
 * backend so a future no-login QR-code flow works without changes here).
 */
export default function WarrantyLookup() {
  const [serial, setSerial] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const s = serial.trim();
    if (!s) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.get(`/item-serials/warranty/${encodeURIComponent(s)}`);
      if (r.data == null || r.data === '') {
        setError(`No record found for serial "${s}".`);
      } else {
        setResult(r.data);
      }
    } catch (err) {
      setError(err.uiMessage ?? 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Warranty lookup</h2>
      </div>

      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Scan or type the manufacturer's serial number from the appliance label
        to confirm whether it's still under warranty from this shop.
      </div>

      <form
        className="card"
        onSubmit={submit}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
      >
        <div style={{ flex: 1 }}>
          <label>Serial number</label>
          <input
            autoFocus
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="e.g. SN-A12B34"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Looking up…' : 'Lookup'}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {result && <WarrantyCard r={result} />}
    </>
  );
}

function WarrantyCard({ r }) {
  const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');

  // Status chip rolls up four signals: sold-vs-returned, warranty type,
  // expiry, and the active flag the backend computes. The plain "no
  // warranty" branches (NONE / CHECKING_ONLY) need their own treatment
  // so the salesman doesn't accidentally tell a customer they're covered.
  let statusChip;
  if (r.status === 'RETURNED') {
    statusChip = { cls: 'chip-warn', label: 'Returned to shop' };
  } else if (r.warrantyType === 'NONE') {
    statusChip = { cls: 'chip-danger', label: 'No warranty' };
  } else if (r.warrantyType === 'CHECKING_ONLY') {
    statusChip = { cls: 'chip-warn', label: 'Checked at sale · no warranty' };
  } else if (r.status === 'SOLD' && r.active) {
    statusChip = { cls: 'chip-success', label: 'Active warranty' };
  } else if (r.status === 'SOLD') {
    statusChip = { cls: 'chip-danger', label: 'Warranty expired' };
  } else {
    statusChip = { cls: 'chip-info', label: r.status };
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0 }}>{r.modelNo ?? 'Unknown model'}</h3>
        <span className={`chip ${statusChip.cls}`}>{statusChip.label}</span>
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: '160px 1fr',
          gap: 6,
          fontSize: 13,
        }}
      >
        <span className="muted">Serial</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{r.serial}</span>
        <span className="muted">Sold on</span>
        <span>{fmt(r.soldAt)}</span>
        <span className="muted">Warranty type</span>
        <span>{r.warrantyType ?? '—'}</span>
        <span className="muted">Warranty start</span>
        <span>{fmt(r.warrantyStartAt)}</span>
        <span className="muted">Warranty end</span>
        <span>{fmt(r.warrantyEndAt)}</span>
        <span className="muted">Warranty length</span>
        <span>
          {r.warrantyDays == null ? '—' : `${r.warrantyDays} days`}
        </span>
      </div>
    </div>
  );
}
