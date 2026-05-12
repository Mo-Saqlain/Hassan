import { useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import ExportButtons from '../components/ExportButtons';

const STATUS_OPTS = [
  { value: 'DRAFT', label: 'Draft', chip: '' },
  { value: 'SENT', label: 'Sent to supplier', chip: 'chip-info' },
  { value: 'RECEIVED', label: 'Received', chip: 'chip-success' },
  { value: 'CANCELLED', label: 'Cancelled', chip: 'chip-danger' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function PurchaseOrders() {
  const { data: orders, loading, error, reload } = useResource('/purchase-orders');
  const { data: suppliers } = useResource('/suppliers');
  const { data: items } = useResource('/items');

  const [show, setShow] = useState(false);
  const [form, setForm] = useState(blank());
  const [submitErr, setSubmitErr] = useState(null);

  const addLine = () => {
    setForm({
      ...form,
      lines: [...form.lines, { itemId: '', quantity: 1, expectedUnitCost: '' }],
    });
  };

  const updateLine = (idx, patch) => {
    setForm({
      ...form,
      lines: form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    });
  };

  const removeLine = (idx) => {
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  };

  const total = form.lines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.expectedUnitCost || 0),
    0,
  );

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    const validLines = form.lines.filter(
      (l) => l.itemId && Number(l.quantity) > 0 && Number(l.expectedUnitCost) >= 0,
    );
    if (validLines.length === 0) {
      setSubmitErr('Add at least one line item with an item, quantity and cost.');
      return;
    }
    try {
      await api.post('/purchase-orders', {
        supplierId: form.supplierId,
        orderDate: form.orderDate,
        expectedDate: form.expectedDate || undefined,
        status: form.status,
        notes: form.notes || undefined,
        lines: validLines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
          expectedUnitCost: Number(l.expectedUnitCost),
        })),
      });
      setShow(false);
      setForm(blank());
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  const setStatus = async (po, status) => {
    if (!window.confirm(`Mark PO ${po.poNo} as ${status}?`)) return;
    try {
      await api.patch(`/purchase-orders/${po.id}/status`, { status });
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Update failed');
    }
  };

  const remove = async (po) => {
    if (!window.confirm(`Delete PO ${po.poNo}? This can't be undone.`)) return;
    try {
      await api.delete(`/purchase-orders/${po.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Purchase orders</h1>
          <p>Orders placed with suppliers — Draft → Sent → Received.</p>
        </div>
        <div className="row">
          <ExportButtons
            filename="purchase_orders"
            title="Purchase Orders"
            columns={[
              { key: 'poNo', label: 'PO #' },
              { key: 'orderDate', label: 'Order date' },
              { key: 'supplier', label: 'Supplier', value: (r) => r.supplier?.name ?? '' },
              { key: 'status', label: 'Status' },
              { key: 'totalAmount', label: 'Total', align: 'right' },
              { key: 'lines', label: 'Items', value: (r) => (r.lines ?? []).length },
            ]}
            rows={orders}
          />
          <button className="btn btn-sm btn-primary" onClick={() => setShow(true)}>
            + New purchase order
          </button>
        </div>
      </div>

      {error && <div className="chip chip-danger">{error}</div>}

      {show && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>New purchase order</h3>
          {submitErr && (
            <div className="chip chip-danger" style={{ marginBottom: 10 }}>
              {submitErr}
            </div>
          )}
          <div className="form-row">
            <div>
              <label>Supplier *</label>
              <select
                className="select"
                required
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              >
                <option value="">— Select —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Order date *</label>
              <input
                className="input"
                type="date"
                required
                value={form.orderDate}
                onChange={(e) => setForm({ ...form, orderDate: e.target.value })}
              />
            </div>
            <div>
              <label>Expected delivery</label>
              <input
                className="input"
                type="date"
                value={form.expectedDate}
                onChange={(e) =>
                  setForm({ ...form, expectedDate: e.target.value })
                }
              />
            </div>
            <div>
              <label>Status</label>
              <select
                className="select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUS_OPTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h4 style={{ marginTop: 8 }}>Line items</h4>
          <div className="table-wrap" style={{ marginBottom: 8 }}>
            <table className="t">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Expected unit cost</th>
                  <th className="num">Line total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((ln, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        className="select"
                        value={ln.itemId}
                        onChange={(e) =>
                          updateLine(idx, { itemId: e.target.value })
                        }
                      >
                        <option value="">— Select —</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.modelNo ?? it.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        className="input"
                        type="number"
                        min="1"
                        step="1"
                        value={ln.quantity}
                        onChange={(e) =>
                          updateLine(idx, { quantity: e.target.value })
                        }
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="input"
                        type="number"
                        step="any"
                        min="0"
                        value={ln.expectedUnitCost}
                        onChange={(e) =>
                          updateLine(idx, { expectedUnitCost: e.target.value })
                        }
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {(
                        Number(ln.quantity || 0) *
                        Number(ln.expectedUnitCost || 0)
                      ).toFixed(2)}
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeLine(idx)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-sm" onClick={addLine}>
            + Add line
          </button>
          <div style={{ marginTop: 12 }}>
            <strong>Total: Rs {total.toFixed(2)}</strong>
          </div>
          <div>
            <label>Notes</label>
            <textarea
              className="input"
              style={{ height: 'auto', padding: '10px 14px' }}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              Save PO
            </button>{' '}
            <button type="button" className="btn" onClick={() => setShow(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card muted center">No purchase orders yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Order date</th>
                <th>Expected</th>
                <th>Supplier</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => {
                const statusOpt = STATUS_OPTS.find((s) => s.value === po.status);
                return (
                  <tr key={po.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {po.poNo}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {po.orderDate}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {po.expectedDate ?? '—'}
                    </td>
                    <td>{po.supplier?.name ?? '—'}</td>
                    <td className="num">{(po.lines ?? []).length}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {Number(po.totalAmount).toFixed(2)}
                    </td>
                    <td>
                      <span className={'chip ' + (statusOpt?.chip ?? '')}>
                        {statusOpt?.label ?? po.status}
                      </span>
                    </td>
                    <td className="num">
                      {po.status === 'DRAFT' && (
                        <button
                          className="btn btn-sm"
                          onClick={() => setStatus(po, 'SENT')}
                        >
                          Send
                        </button>
                      )}{' '}
                      {po.status === 'SENT' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => setStatus(po, 'RECEIVED')}
                        >
                          Mark received
                        </button>
                      )}{' '}
                      {(po.status === 'DRAFT' || po.status === 'SENT') && (
                        <button
                          className="btn btn-sm"
                          onClick={() => setStatus(po, 'CANCELLED')}
                        >
                          Cancel
                        </button>
                      )}{' '}
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => remove(po)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function blank() {
  return {
    supplierId: '',
    orderDate: todayStr(),
    expectedDate: '',
    status: 'DRAFT',
    notes: '',
    lines: [{ itemId: '', quantity: 1, expectedUnitCost: '' }],
  };
}
