import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import { FunnelStages } from '../components/MiniCharts';

/**
 * Operational delivery tracking. Stock is already deducted at sale time;
 * this page tracks the physical handover. Active statuses (PENDING /
 * OUT_FOR_DELIVERY / INSTALLATION_PENDING) keep the sold units in the
 * `reservedQty` overlay on the Item so the Stock summary shows the right
 * `available = onHand - reserved` figure.
 */
const STATUSES = [
  { value: 'PENDING', label: 'Pending', chip: 'chip-info' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery', chip: 'chip-warn' },
  { value: 'DELIVERED', label: 'Delivered', chip: 'chip-success' },
  { value: 'INSTALLATION_PENDING', label: 'Installation pending', chip: 'chip-warn' },
  { value: 'INSTALLED', label: 'Installed', chip: 'chip-success' },
  { value: 'CANCELLED', label: 'Cancelled', chip: 'chip-danger' },
];

const blank = () => ({
  saleId: '',
  customerId: '',
  address: '',
  phone: '',
  assignedTo: '',
  vehicle: '',
  scheduledFor: '',
  status: 'PENDING',
  notes: '',
});

export default function Deliveries() {
  const { data: deliveries, loading, error, reload } = useResource('/deliveries');
  const { data: sales } = useResource('/sales');
  const { data: customers } = useResource('/customers');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank());
  const [submitErr, setSubmitErr] = useState(null);

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
            saleId: row.saleId ?? '',
            customerId: row.customerId ?? '',
            address: row.address ?? '',
            phone: row.phone ?? '',
            assignedTo: row.assignedTo ?? '',
            vehicle: row.vehicle ?? '',
            scheduledFor: row.scheduledFor
              ? new Date(row.scheduledFor).toISOString().slice(0, 10)
              : '',
            status: row.status,
            notes: row.notes ?? '',
          }
        : blank(),
    );
    setShowForm(true);
    setSubmitErr(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    const payload = {
      saleId: form.saleId || undefined,
      customerId: form.customerId || undefined,
      address: form.address || undefined,
      phone: form.phone || undefined,
      assignedTo: form.assignedTo || undefined,
      vehicle: form.vehicle || undefined,
      scheduledFor: form.scheduledFor || undefined,
      status: form.status,
      notes: form.notes || undefined,
    };
    try {
      if (editing) {
        await api.patch(`/deliveries/${editing.id}`, payload);
      } else {
        await api.post('/deliveries', payload);
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
    if (!window.confirm(`Delete delivery ${row.deliveryNo}?`)) return;
    try {
      await api.delete(`/deliveries/${row.id}`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    }
  };

  // Tally already-loaded delivery rows by status — no extra fetch needed.
  // Mirrors the Service Tickets funnel for visual symmetry.
  const tally = useMemo(() => {
    const out = {};
    for (const d of deliveries ?? []) out[d.status] = (out[d.status] || 0) + 1;
    return out;
  }, [deliveries]);

  return (
    <>
      <div className="page-header">
        <h2>Deliveries</h2>
        <button className="btn btn-primary" onClick={() => open(null)}>
          + New delivery
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {(deliveries ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div
            className="eyebrow"
            style={{ marginBottom: 8 }}
            title="A bloated 'Pending' or 'Out for delivery' stage means transport is backed up. Inventory was already deducted at sale time; this only tracks the physical handover."
          >
            Delivery pipeline
          </div>
          <FunnelStages
            stages={[
              { label: 'Pending', value: tally.PENDING ?? 0, color: '#fbbf24' },
              { label: 'Out for delivery', value: tally.OUT_FOR_DELIVERY ?? 0, color: '#fb923c' },
              { label: 'Installation pending', value: tally.INSTALLATION_PENDING ?? 0, color: '#8764b8' },
              { label: 'Installed', value: tally.INSTALLED ?? 0, color: '#34d399' },
              { label: 'Delivered', value: tally.DELIVERED ?? 0, color: 'var(--text-muted)' },
              { label: 'Cancelled', value: tally.CANCELLED ?? 0, color: '#ef4444' },
            ]}
          />
        </div>
      )}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>
            {editing ? `Edit ${editing.deliveryNo}` : 'New delivery'}
          </h3>
          {submitErr && <div className="alert alert-error">{submitErr}</div>}
          <div className="form-row">
            <div>
              <label title="Link to the sale. Address / phone / customer auto-fill from the sale's customer record.">
                Sale
              </label>
              <select
                value={form.saleId}
                onChange={(e) => setForm({ ...form, saleId: e.target.value })}
              >
                <option value="">— None —</option>
                {sales
                  .filter((s) => !s.reversedAt)
                  .slice(0, 200)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.invoiceNo} · {s.customer?.name ?? 'Walk-in'}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label>Customer (if no sale)</label>
              <select
                value={form.customerId}
                onChange={(e) =>
                  setForm({ ...form, customerId: e.target.value })
                }
              >
                <option value="">—</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
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
              <label>Scheduled for</label>
              <input
                type="date"
                value={form.scheduledFor}
                onChange={(e) =>
                  setForm({ ...form, scheduledFor: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label>Address</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              placeholder="Full delivery address"
            />
          </div>
          <div className="form-row">
            <div>
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label>Assigned to</label>
              <input
                value={form.assignedTo}
                onChange={(e) =>
                  setForm({ ...form, assignedTo: e.target.value })
                }
                placeholder="Driver / delivery boy"
              />
            </div>
            <div>
              <label>Vehicle</label>
              <input
                value={form.vehicle}
                onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
                placeholder="e.g. Suzuki Ravi LRD-2914"
              />
            </div>
          </div>
          <div>
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
      ) : deliveries.length === 0 ? (
        <div className="card muted center">No deliveries yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Delivery #</th>
              <th>Sale</th>
              <th>Customer</th>
              <th>Scheduled</th>
              <th>Status</th>
              <th>Assigned</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => {
              const status = STATUSES.find((s) => s.value === d.status) ?? STATUSES[0];
              return (
                <tr key={d.id}>
                  <td>{d.deliveryNo}</td>
                  <td>{d.sale?.invoiceNo ?? '—'}</td>
                  <td>{d.customer?.name ?? '—'}</td>
                  <td>
                    {d.scheduledFor
                      ? new Date(d.scheduledFor).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>
                    <span className={`chip ${status.chip}`}>{status.label}</span>
                  </td>
                  <td>{d.assignedTo ?? '—'}</td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => open(d)}>
                      Edit
                    </button>{' '}
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => remove(d)}
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
