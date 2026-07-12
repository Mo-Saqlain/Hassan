import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import { FunnelStages } from '../components/MiniCharts';

/**
 * Service / warranty repair workflow. Tickets walk through:
 *   RECEIVED → SENT_TO_COMPANY → WAITING_PARTS → UNDER_REPAIR →
 *   READY_FOR_PICKUP → DELIVERED (or UNREPAIRABLE for write-offs).
 *
 * Each ticket optionally links to an item serial — when linked, the
 * warranty-lookup section of the form auto-flags `inWarranty`. The
 * unlinked path covers older units / lost labels / gray-market gear.
 */
const STATUSES = [
  { value: 'RECEIVED', label: 'Received', chip: 'chip-info' },
  { value: 'SENT_TO_COMPANY', label: 'Sent to company', chip: 'chip-info' },
  { value: 'WAITING_PARTS', label: 'Waiting parts', chip: 'chip-warn' },
  { value: 'UNDER_REPAIR', label: 'Under repair', chip: 'chip-warn' },
  { value: 'READY_FOR_PICKUP', label: 'Ready for pickup', chip: 'chip-success' },
  { value: 'DELIVERED', label: 'Delivered', chip: 'chip-success' },
  { value: 'UNREPAIRABLE', label: 'Unrepairable', chip: 'chip-danger' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  customerId: '',
  itemSerialId: '',
  saleItemId: '',
  itemDescription: '',
  complaint: '',
  inWarranty: false,
  status: 'RECEIVED',
  receivedAt: todayStr(),
  estimatedCompletion: '',
  technicianNotes: '',
  resolutionNotes: '',
  estimatedCost: '',
  actualCost: '',
});

export default function ServiceTickets() {
  const { data: tickets, loading, error, reload } = useResource('/service-tickets');
  const { data: customers } = useResource('/customers');
  const [tally, setTally] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank());
  const [serialLookup, setSerialLookup] = useState('');
  const [invoiceLookup, setInvoiceLookup] = useState('');
  const [receiptLines, setReceiptLines] = useState([]);
  const [submitErr, setSubmitErr] = useState(null);

  useEffect(() => {
    api
      .get('/service-tickets/tally')
      .then((r) => setTally(r.data ?? {}))
      .catch(() => setTally({}));
  }, [tickets]);

  const isDirty = useMemo(
    () => showForm && JSON.stringify(form) !== JSON.stringify(blank()),
    [showForm, form],
  );
  useUnsavedChangesPrompt(isDirty);

  const open = (row) => {
    setEditing(row);
    setForm(
      row
        ? {
            customerId: row.customerId ?? '',
            itemSerialId: row.itemSerialId ?? '',
            saleItemId: row.saleItemId ?? '',
            itemDescription: row.itemDescription ?? '',
            complaint: row.complaint ?? '',
            inWarranty: !!row.inWarranty,
            status: row.status,
            receivedAt: (row.receivedAt ?? todayStr()).slice(0, 10),
            estimatedCompletion: row.estimatedCompletion
              ? row.estimatedCompletion.slice(0, 10)
              : '',
            technicianNotes: row.technicianNotes ?? '',
            resolutionNotes: row.resolutionNotes ?? '',
            estimatedCost:
              row.estimatedCost == null ? '' : String(row.estimatedCost),
            actualCost: row.actualCost == null ? '' : String(row.actualCost),
          }
        : blank(),
    );
    setShowForm(true);
    setSerialLookup('');
    setInvoiceLookup('');
    setReceiptLines([]);
    setSubmitErr(null);
  };

  // Model-only path: the customer brought the stamped receipt (or we found it
  // by their name). Pull the receipt's lines so the operator can attach the
  // exact item being serviced — no serial needed.
  const lookupInvoice = async () => {
    if (!invoiceLookup.trim()) return;
    setSubmitErr(null);
    setReceiptLines([]);
    try {
      const r = await api.get(
        `/sales/warranty/by-invoice/${encodeURIComponent(invoiceLookup.trim())}`,
      );
      if (r.data && r.data.lines?.length) {
        setReceiptLines(r.data.lines);
      } else {
        setSubmitErr(`No receipt found for "${invoiceLookup.trim()}".`);
      }
    } catch (e) {
      setSubmitErr(e.uiMessage ?? 'Receipt lookup failed');
    }
  };

  const pickReceiptLine = (line) => {
    setForm((f) => ({
      ...f,
      saleItemId: line.saleItemId,
      itemSerialId: '',
      itemDescription:
        line.itemName + (line.modelNo ? ` · ${line.modelNo}` : ''),
      inWarranty: !!line.active,
      customerId: line.customerId ?? f.customerId,
    }));
    setReceiptLines([]);
  };

  const lookupSerial = async () => {
    if (!serialLookup.trim()) return;
    try {
      const r = await api.get(
        `/item-serials/warranty/${encodeURIComponent(serialLookup.trim())}`,
      );
      if (r.data) {
        setForm((f) => ({
          ...f,
          saleItemId: '',
          itemDescription: r.data.modelNo ?? f.itemDescription,
          inWarranty: !!r.data.active,
          customerId: f.customerId,
        }));
      } else {
        setSubmitErr(`No record for serial "${serialLookup.trim()}".`);
      }
    } catch (e) {
      setSubmitErr(e.uiMessage ?? 'Serial lookup failed');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    const payload = {
      customerId: form.customerId || undefined,
      itemSerialId: form.itemSerialId || undefined,
      saleItemId: form.saleItemId || undefined,
      itemDescription: form.itemDescription || undefined,
      complaint: form.complaint,
      inWarranty: form.inWarranty,
      status: form.status,
      receivedAt: form.receivedAt || undefined,
      estimatedCompletion: form.estimatedCompletion || undefined,
      technicianNotes: form.technicianNotes || undefined,
      resolutionNotes: form.resolutionNotes || undefined,
      estimatedCost:
        form.estimatedCost === '' ? undefined : Number(form.estimatedCost),
      actualCost: form.actualCost === '' ? undefined : Number(form.actualCost),
    };
    try {
      if (editing) {
        await api.patch(`/service-tickets/${editing.id}`, payload);
      } else {
        await api.post('/service-tickets', payload);
      }
      setShowForm(false);
      setEditing(null);
      setForm(blank());
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ticket ${row.ticketNo}?`)) return;
    try {
      await api.delete(`/service-tickets/${row.id}`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Service tickets</h2>
        <button className="btn btn-primary" onClick={() => open(null)}>
          + New ticket
        </button>
      </div>

      <div
        className="grid-stat"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
          marginBottom: 14,
        }}
      >
        {STATUSES.map((s) => (
          <div className="stat" key={s.value}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{tally[s.value] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 8 }}
          title="A bloated 'Sent to Company' stage usually means a manufacturer is dragging their feet on warranty claims."
        >
          Service pipeline
        </div>
        <FunnelStages
          stages={[
            { label: 'Received', value: tally.RECEIVED ?? 0, color: '#0078d4' },
            { label: 'Sent to company', value: tally.SENT_TO_COMPANY ?? 0, color: '#8764b8' },
            { label: 'Waiting parts', value: tally.WAITING_PARTS ?? 0, color: '#fbbf24' },
            { label: 'Under repair', value: tally.UNDER_REPAIR ?? 0, color: '#fb923c' },
            { label: 'Ready for pickup', value: tally.READY_FOR_PICKUP ?? 0, color: '#34d399' },
            { label: 'Delivered', value: tally.DELIVERED ?? 0, color: 'var(--text-muted)' },
            { label: 'Unrepairable', value: tally.UNREPAIRABLE ?? 0, color: '#ef4444' },
          ]}
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>
            {editing ? `Edit ${editing.ticketNo}` : 'New service ticket'}
          </h3>
          {submitErr && <div className="alert alert-error">{submitErr}</div>}
          <div className="form-row">
            <div>
              <label>Customer</label>
              <select
                value={form.customerId}
                onChange={(e) =>
                  setForm({ ...form, customerId: e.target.value })
                }
              >
                <option value="">— Walk-in —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 220 }}>
              <label title="If the unit was sold through us and the customer has the serial label, paste it here. The warranty status auto-fills.">
                Serial (optional)
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={serialLookup}
                  onChange={(e) => setSerialLookup(e.target.value)}
                  placeholder="e.g. SN-A12B34"
                  style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
                />
                <button type="button" className="btn btn-sm" onClick={lookupSerial}>
                  Lookup
                </button>
              </div>
            </div>
            <div style={{ minWidth: 220 }}>
              <label title="Model-only item with no serial? Type the receipt number the customer brought (or that you found by their name) and pick the line being serviced. Warranty auto-fills.">
                Receipt no. (model-only)
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={invoiceLookup}
                  onChange={(e) => setInvoiceLookup(e.target.value)}
                  placeholder="e.g. INV-000123"
                  style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
                />
                <button type="button" className="btn btn-sm" onClick={lookupInvoice}>
                  Lookup
                </button>
              </div>
            </div>
            <div>
              <label>Item description</label>
              <input
                value={form.itemDescription}
                onChange={(e) =>
                  setForm({ ...form, itemDescription: e.target.value })
                }
                placeholder="e.g. Dawlance LVS-15 inverter AC"
              />
            </div>
            <div>
              <label>In warranty?</label>
              <input
                type="checkbox"
                checked={form.inWarranty}
                onChange={(e) =>
                  setForm({ ...form, inWarranty: e.target.checked })
                }
              />
            </div>
          </div>
          {receiptLines.length > 0 && (
            <div className="card" style={{ marginBottom: 12, background: 'var(--surface-2)' }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Pick the line being serviced:
              </div>
              {receiptLines.map((line) => (
                <div
                  key={line.saleItemId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {line.itemName}
                    {line.modelNo ? ` · ${line.modelNo}` : ''}{' '}
                    {line.warrantyEndAt ? (
                      <span
                        className={`chip ${line.active ? 'chip-success' : 'chip-danger'}`}
                      >
                        {line.active
                          ? `In warranty till ${new Date(line.warrantyEndAt).toLocaleDateString()}`
                          : 'Warranty expired'}
                      </span>
                    ) : (
                      <span className="chip">No warranty recorded</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => pickReceiptLine(line)}
                  >
                    Attach
                  </button>
                </div>
              ))}
            </div>
          )}
          {form.saleItemId && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              ✓ Linked to a receipt line (model-only warranty).
            </div>
          )}
          <div>
            <label>Complaint *</label>
            <textarea
              required
              value={form.complaint}
              onChange={(e) => setForm({ ...form, complaint: e.target.value })}
              placeholder="What's not working?"
              rows={2}
            />
          </div>
          <div className="form-row">
            <div>
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Received on</label>
              <input
                type="date"
                value={form.receivedAt}
                onChange={(e) =>
                  setForm({ ...form, receivedAt: e.target.value })
                }
              />
            </div>
            <div>
              <label>Estimated completion</label>
              <input
                type="date"
                value={form.estimatedCompletion}
                onChange={(e) =>
                  setForm({ ...form, estimatedCompletion: e.target.value })
                }
              />
            </div>
            <div>
              <label>Estimated cost</label>
              <input
                type="number"
                step="any"
                min="0"
                value={form.estimatedCost}
                onChange={(e) =>
                  setForm({ ...form, estimatedCost: e.target.value })
                }
              />
            </div>
            <div>
              <label>Actual cost</label>
              <input
                type="number"
                step="any"
                min="0"
                value={form.actualCost}
                onChange={(e) =>
                  setForm({ ...form, actualCost: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label>Technician notes</label>
            <textarea
              value={form.technicianNotes}
              onChange={(e) =>
                setForm({ ...form, technicianNotes: e.target.value })
              }
              rows={2}
            />
          </div>
          <div>
            <label>Resolution notes</label>
            <textarea
              value={form.resolutionNotes}
              onChange={(e) =>
                setForm({ ...form, resolutionNotes: e.target.value })
              }
              rows={2}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Update' : 'Create'}
            </button>{' '}
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setForm(blank());
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="card muted center">No service tickets yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Ticket #</th>
              <th>Received</th>
              <th>Customer</th>
              <th>Item</th>
              <th>Complaint</th>
              <th>Status</th>
              <th>Warranty</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const status = STATUSES.find((s) => s.value === t.status) ?? STATUSES[0];
              return (
                <tr key={t.id}>
                  <td>{t.ticketNo}</td>
                  <td>{t.receivedAt ? new Date(t.receivedAt).toLocaleDateString() : '—'}</td>
                  <td>{t.customer?.name ?? '—'}</td>
                  <td>
                    {t.itemSerial?.serial && (
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {t.itemSerial.serial}
                      </div>
                    )}
                    {t.itemDescription ?? t.itemSerial?.item?.modelNo ?? '—'}
                  </td>
                  <td style={{ maxWidth: 260, whiteSpace: 'pre-wrap' }}>
                    {t.complaint}
                  </td>
                  <td>
                    <span className={`chip ${status.chip}`}>{status.label}</span>
                  </td>
                  <td>
                    {t.inWarranty ? (
                      <span className="chip chip-success">In warranty</span>
                    ) : (
                      <span className="chip">Out of warranty</span>
                    )}
                  </td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => open(t)}>
                      Edit
                    </button>{' '}
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => remove(t)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
