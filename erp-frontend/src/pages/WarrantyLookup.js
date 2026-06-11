import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

/**
 * Counter-friendly warranty lookup. Four ways in, because not every unit can
 * be resolved the same way:
 *
 *   • Serial   — the unit carries a manufacturer serial label (the original
 *                per-unit lookup, `GET /item-serials/warranty/:serial`).
 *   • Receipt  — model-only item; customer brought the stamped receipt. We
 *                resolve the warranty stamped on the sale line by invoice no.
 *   • Customer — receipt lost; look the buyer up and list their purchases.
 *   • Model    — buyer isn't in the system; search sales of a model in a
 *                date window.
 *
 * The last three hit the `GET /api/sales/warranty/*` family, which returns the
 * line-level warranty snapshot frozen at sale time.
 */
const MODES = [
  { key: 'serial', label: 'Serial number' },
  { key: 'invoice', label: 'Receipt no.' },
  { key: 'customer', label: 'Customer' },
  { key: 'model', label: 'Model + date' },
];

export default function WarrantyLookup() {
  const [mode, setMode] = useState('serial');

  return (
    <>
      <div className="page-header">
        <h2>Warranty lookup</h2>
      </div>

      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Confirm whether a unit is still under warranty from this shop. Items
        with a serial label resolve per unit; items sold by model only resolve
        against the stamped receipt — by receipt number, by customer, or by
        model and purchase date.
      </div>

      <div className="tab-strip" style={{ marginBottom: 12 }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`btn btn-sm ${mode === m.key ? 'btn-primary' : ''}`}
            onClick={() => setMode(m.key)}
            style={{ marginRight: 6 }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'serial' && <SerialLookup />}
      {mode === 'invoice' && <InvoiceLookup />}
      {mode === 'customer' && <CustomerLookup />}
      {mode === 'model' && <ModelLookup />}
    </>
  );
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');

/* ─────────────────────────── Serial (per-unit) ─────────────────────────── */

function SerialLookup() {
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
      const r = await api.get(
        `/item-serials/warranty/${encodeURIComponent(s)}`,
      );
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
      {result && <SerialCard r={result} />}
    </>
  );
}

function SerialCard({ r }) {
  let statusChip;
  if (r.allocationStatus === 'BOOKED') {
    statusChip = { cls: 'chip-warn', label: 'On hold · payment pending' };
  } else if (r.allocationStatus === 'AVAILABLE' && r.status === 'IN_STOCK') {
    statusChip = { cls: 'chip-info', label: 'Available for sale' };
  } else if (r.status === 'RETURNED') {
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
        <span>{r.warrantyDays == null ? '—' : `${r.warrantyDays} days`}</span>
      </div>
    </div>
  );
}

/* ─────────── Line-card (shared by invoice / customer / model) ─────────── */

function lineChip(line) {
  if (line.warrantyType === 'NONE') {
    return { cls: 'chip-danger', label: 'No warranty' };
  }
  if (line.warrantyType === 'CHECKING_ONLY') {
    return { cls: 'chip-warn', label: 'Checked at sale · no warranty' };
  }
  if (!line.warrantyEndAt) {
    return { cls: 'chip', label: 'No warranty recorded' };
  }
  return line.active
    ? { cls: 'chip-success', label: 'Active warranty' }
    : { cls: 'chip-danger', label: 'Warranty expired' };
}

function LineCard({ line, showCustomer }) {
  const chip = lineChip(line);
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0 }}>
          {line.itemName}
          {line.modelNo && (
            <span className="muted" style={{ fontWeight: 400 }}>
              {' '}
              · {line.modelNo}
            </span>
          )}
        </h3>
        <span className={`chip ${chip.cls}`}>{chip.label}</span>
        {line.tracksSerials && (
          <span
            className="chip chip-info"
            title="This item is serial-tracked. For a precise per-unit answer, look it up by its serial number."
          >
            serial-tracked
          </span>
        )}
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
        <span className="muted">Receipt no.</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{line.invoiceNo}</span>
        {showCustomer && (
          <>
            <span className="muted">Customer</span>
            <span>
              {line.customerName ?? 'Walk-in'}
              {line.customerPhone ? ` · ${line.customerPhone}` : ''}
            </span>
          </>
        )}
        <span className="muted">Sold on</span>
        <span>{fmt(line.soldAt)}</span>
        <span className="muted">Quantity</span>
        <span>{line.quantity}</span>
        <span className="muted">Warranty type</span>
        <span>{line.warrantyType ?? '—'}</span>
        <span className="muted">Warranty start</span>
        <span>{fmt(line.warrantyStartAt)}</span>
        <span className="muted">Warranty end</span>
        <span>{fmt(line.warrantyEndAt)}</span>
        <span className="muted">Warranty length</span>
        <span>
          {line.warrantyDays == null ? '—' : `${line.warrantyDays} days`}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────── By receipt ─────────────────────────────── */

function InvoiceLookup() {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const s = invoiceNo.trim();
    if (!s) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.get(
        `/sales/warranty/by-invoice/${encodeURIComponent(s)}`,
      );
      if (r.data == null || r.data === '') {
        setError(`No receipt found for "${s}".`);
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
      <form
        className="card"
        onSubmit={submit}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
      >
        <div style={{ flex: 1 }}>
          <label>Receipt / invoice number</label>
          <input
            autoFocus
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="e.g. INV-000123"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Looking up…' : 'Lookup'}
        </button>
      </form>
      {error && <div className="alert alert-error">{error}</div>}
      {result && (
        <>
          <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Receipt <strong>{result.invoiceNo}</strong> · sold to{' '}
            {result.customerName ?? 'Walk-in'} on {fmt(result.soldAt)}
          </div>
          {result.lines.length === 0 ? (
            <div className="card muted center" style={{ marginTop: 10 }}>
              No lines on this receipt.
            </div>
          ) : (
            result.lines.map((line) => (
              <LineCard key={line.saleItemId} line={line} />
            ))
          )}
        </>
      )}
    </>
  );
}

/* ────────────────────────────── By customer ────────────────────────────── */

function CustomerLookup() {
  const { data: customers } = useResource('/customers');
  const [customerId, setCustomerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!customerId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.get(`/sales/warranty/by-customer/${customerId}`);
      setResult(r.data ?? []);
    } catch (err) {
      setError(err.uiMessage ?? 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form
        className="card"
        onSubmit={submit}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
      >
        <div style={{ flex: 1 }}>
          <label>Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">— Select customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ''}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !customerId}
        >
          {busy ? 'Looking up…' : 'Lookup'}
        </button>
      </form>
      {error && <div className="alert alert-error">{error}</div>}
      {result &&
        (result.length === 0 ? (
          <div className="card muted center" style={{ marginTop: 12 }}>
            No purchases on record for this customer.
          </div>
        ) : (
          result.map((line) => (
            <LineCard key={line.saleItemId} line={line} />
          ))
        ))}
    </>
  );
}

/* ──────────────────────────── By model + date ──────────────────────────── */

function ModelLookup() {
  const { data: items } = useResource('/items');
  const [itemId, setItemId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? ''),
      ),
    [items],
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!itemId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ itemId });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const r = await api.get(`/sales/warranty/by-model?${params.toString()}`);
      setResult(r.data ?? []);
    } catch (err) {
      setError(err.uiMessage ?? 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form className="card" onSubmit={submit}>
        <div className="form-row">
          <div style={{ flex: 2 }}>
            <label>Model / item</label>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">— Select item —</option>
              {sorted.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                  {it.modelNo ? ` · ${it.modelNo}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !itemId}
            >
              {busy ? 'Looking up…' : 'Lookup'}
            </button>
          </div>
        </div>
      </form>
      {error && <div className="alert alert-error">{error}</div>}
      {result &&
        (result.length === 0 ? (
          <div className="card muted center" style={{ marginTop: 12 }}>
            No sales of this model in the selected window.
          </div>
        ) : (
          result.map((line) => (
            <LineCard key={line.saleItemId} line={line} showCustomer />
          ))
        ))}
    </>
  );
}
