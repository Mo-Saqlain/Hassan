import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import ReverseAction from '../components/ReverseAction';
import EditVoucherBar from '../components/EditVoucherBar';

const emptyLine = () => ({ itemId: '', quantity: 1, unitPrice: 0 });

export default function PurchaseReturns() {
  const { data: returns, loading, error, reload } = useResource(
    '/purchase-returns',
  );
  const { data: items } = useResource('/items');
  const { data: suppliers } = useResource('/suppliers');
  const { data: stores } = useResource('/stores');

  const blankForm = () => ({
    supplierId: '',
    storeId: '',
    purchaseId: '',
    reason: '',
    lines: [emptyLine()],
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState(null);

  const isDirty = useMemo(
    () => showForm && JSON.stringify(form) !== JSON.stringify(blankForm()),
    [showForm, form],
  );
  useUnsavedChangesPrompt(isDirty);

  const itemById = useMemo(() => {
    const m = new Map();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  const total = useMemo(
    () =>
      form.lines.reduce(
        (s, ln) => s + Number(ln.quantity ?? 0) * Number(ln.unitPrice ?? 0),
        0,
      ),
    [form.lines],
  );

  const updateLine = (idx, patch) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((ln, i) => (i === idx ? { ...ln, ...patch } : ln)),
    }));

  const onItemChange = (idx, itemId) => {
    const it = itemById.get(itemId);
    updateLine(idx, { itemId, unitPrice: it ? Number(it.purchasePrice) : 0 });
  };

  const startEdit = (r) => {
    setEditing(r);
    setReason('');
    setSubmitError(null);
    setForm({
      ...blankForm(),
      supplierId: r.supplierId ?? '',
      storeId: r.storeId ?? '',
      purchaseId: r.purchaseId ?? '',
      reason: r.reason ?? '',
      disposition: r.disposition ?? 'STOCK',
      lines: (r.lines ?? []).map((ln) => ({
        itemId: ln.itemId,
        quantity: String(ln.quantity),
        unitPrice: String(ln.unitPrice),
      })),
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditing(null);
    setReason('');
    setForm(blankForm());
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const payload = {
      supplierId: form.supplierId || undefined,
      storeId: form.storeId || undefined,
      purchaseId: form.purchaseId || undefined,
      reason: form.reason || undefined,
      lines: form.lines
        .filter((ln) => ln.itemId)
        .map((ln) => ({
          itemId: ln.itemId,
          quantity: Number(ln.quantity),
          unitPrice: Number(ln.unitPrice),
        })),
    };
    if (payload.lines.length === 0) {
      setSubmitError('At least one line is required');
      return;
    }
    try {
      if (editing) {
        await api.patch(`/purchase-returns/${editing.id}`, {
          ...payload,
          editReason: reason,
        });
      } else {
        await api.post('/purchase-returns', payload);
      }
      cancelForm();
      reload();
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Save failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Purchase Returns</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New Purchase Return
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>
            {editing ? `Correct ${editing.returnNo}` : 'New Purchase Return'}
          </h3>
          {editing && (
            <EditVoucherBar
              label={editing.returnNo}
              reason={reason}
              onReason={setReason}
              onCancel={cancelForm}
              editCount={Number(editing.editCount ?? 0)}
            />
          )}
          {submitError && <div className="alert alert-error">{submitError}</div>}
          <div className="form-row">
            <div>
              <label>Supplier</label>
              <select
                value={form.supplierId}
                onChange={(e) =>
                  setForm({ ...form, supplierId: e.target.value })
                }
              >
                <option value="">— None —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Store</label>
              <select
                value={form.storeId}
                onChange={(e) => setForm({ ...form, storeId: e.target.value })}
              >
                <option value="">— Default —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Reason</label>
              <input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>

          <table style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">Qty</th>
                <th className="right">Unit Price</th>
                <th className="right">Line Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((ln, idx) => (
                <tr key={idx}>
                  <td>
                    <select
                      value={ln.itemId}
                      onChange={(e) => onItemChange(idx, e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={ln.quantity}
                      onChange={(e) =>
                        updateLine(idx, { quantity: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={ln.unitPrice}
                      onChange={(e) =>
                        updateLine(idx, { unitPrice: e.target.value })
                      }
                    />
                  </td>
                  <td className="right">
                    {(Number(ln.quantity) * Number(ln.unitPrice)).toFixed(2)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          lines:
                            f.lines.length > 1
                              ? f.lines.filter((_, i) => i !== idx)
                              : f.lines,
                        }))
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
            }
          >
            + Add Line
          </button>

          <div className="form-row" style={{ marginTop: 16 }}>
            <div>
              <label>Total Returned</label>
              <input value={total.toFixed(2)} readOnly />
            </div>
          </div>

          <button type="submit" className="btn btn-primary">
            Save Return
          </button>{' '}
          <button type="button" className="btn" onClick={cancelForm}>
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : returns.length === 0 ? (
        <div className="card muted center">No purchase returns yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Return #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th className="right">Total</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id}>
                <td>{r.returnNo}</td>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.supplier?.name ?? '—'}</td>
                <td className="right">{Number(r.totalAmount).toFixed(2)}</td>
                <td>{r.reason ?? '—'}</td>
                <td>
                  {!r.reversedAt && !r.linkedSaleReturnId && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => startEdit(r)}
                      >
                        Edit
                      </button>{' '}
                    </>
                  )}
                  <ReverseAction
                    endpoint="/purchase-returns"
                    row={r}
                    label={`purchase return ${r.returnNo}`}
                    onDone={reload}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
