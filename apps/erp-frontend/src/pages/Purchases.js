import { Fragment, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import ReverseAction from '../components/ReverseAction';
import EditVoucherBar from '../components/EditVoucherBar';
import ImportCsv from '../components/ImportCsv';
import { IMPORT_SCHEMAS } from '../utils/importSchemas';

const emptyLine = () => ({
  itemId: '',
  storeId: '',
  quantity: 1,
  unitPrice: 0,
  serials: '', // newline-separated; split on submit
});

const emptyItem = () => ({
  modelNo: '',
  name: '',
  sku: '',
  barcode: '',
  brandId: '',
  purchasePrice: '',
  salePrice: '',
});

const blankPurchase = () => ({
  supplierId: '',
  storeId: '',
  discount: 0,
  paidAmount: '',
  paymentMethod: 'CASH',
  notes: '',
  lines: [emptyLine()],
});

export default function Purchases() {
  const { data: purchases, loading, error, reload } = useResource('/purchases');
  const { data: items, setData: setItems, reload: reloadItems } = useResource('/items');
  const { data: suppliers } = useResource('/suppliers');
  const { data: stores } = useResource('/stores');
  const { data: brands } = useResource('/brands');

  // Inline item-creator: which line (index) is currently asking for a new
  // item, plus its draft. Saving creates the item, appends it to the
  // items list, and auto-selects it on the originating line.
  const [newItemFor, setNewItemFor] = useState(null);
  const [newItem, setNewItem] = useState(emptyItem());
  const [newItemError, setNewItemError] = useState(null);
  const [savingNewItem, setSavingNewItem] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState('');
  const [form, setForm] = useState(blankPurchase());
  const [submitError, setSubmitError] = useState(null);

  const isDirty = useMemo(
    () => showForm && JSON.stringify(form) !== JSON.stringify(blankPurchase()),
    [showForm, form],
  );
  useUnsavedChangesPrompt(isDirty);

  const newItemDirty = useMemo(
    () => newItemFor !== null && JSON.stringify(newItem) !== JSON.stringify(emptyItem()),
    [newItemFor, newItem],
  );
  useUnsavedChangesPrompt(newItemDirty);

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
  const net = Math.max(0, total - Number(form.discount || 0));

  const updateLine = (idx, patch) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((ln, i) => (i === idx ? { ...ln, ...patch } : ln)),
    }));

  const onItemChange = (idx, itemId) => {
    const it = itemById.get(itemId);
    updateLine(idx, {
      itemId,
      unitPrice: it ? Number(it.purchasePrice) : 0,
    });
  };

  const addLine = () =>
    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (idx) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines,
    }));

  const openNewItem = (idx) => {
    setNewItem(emptyItem());
    setNewItemFor(idx);
    setNewItemError(null);
  };
  const closeNewItem = () => {
    setNewItemFor(null);
    setNewItemError(null);
  };
  const saveNewItem = async (e) => {
    e.preventDefault();
    setNewItemError(null);
    setSavingNewItem(true);
    const payload = {
      modelNo: newItem.modelNo?.trim() || undefined,
      name: newItem.name?.trim() || undefined,
      sku: newItem.sku?.trim() || undefined,
      barcode: newItem.barcode?.trim() || undefined,
      brandId: newItem.brandId || undefined,
      purchasePrice:
        newItem.purchasePrice === '' ? undefined : Number(newItem.purchasePrice),
      salePrice:
        newItem.salePrice === '' ? undefined : Number(newItem.salePrice),
    };
    if (!payload.modelNo && !payload.name) {
      setNewItemError('Model No or Name is required');
      setSavingNewItem(false);
      return;
    }
    try {
      const r = await api.post('/items', payload);
      const created = r.data;
      // Optimistically prepend so the picker shows it immediately, then
      // kick off a background refresh in case the backend filled defaults.
      setItems((prev) => [created, ...prev]);
      reloadItems();
      // Auto-select on the originating line + prefill its unit price.
      const targetIdx = newItemFor;
      updateLine(targetIdx, {
        itemId: created.id,
        unitPrice: Number(created.purchasePrice ?? 0),
      });
      closeNewItem();
    } catch (err) {
      setNewItemError(err.uiMessage ?? 'Save failed');
    } finally {
      setSavingNewItem(false);
    }
  };

  const startEdit = (p) => {
    setEditing(p);
    setReason('');
    setSubmitError(null);
    setForm({
      ...blankPurchase(),
      supplierId: p.supplierId ?? '',
      storeId: p.storeId ?? '',
      discount: String(p.discount ?? 0),
      paidAmount: p.paidAmount != null ? String(p.paidAmount) : '',
      paymentMethod: p.paymentMethod ?? 'CASH',
      notes: p.notes ?? '',
      lines: (p.lines ?? []).map((ln) => ({
        itemId: ln.itemId,
        storeId: ln.storeId ?? '',
        quantity: String(ln.quantity),
        unitPrice: String(ln.unitPrice),
        // Serials aren't re-sent on a correction: the originals are withdrawn
        // server-side and only re-registered from what's typed here, so
        // pre-filling blank avoids silently duplicating an intake.
        serials: '',
      })),
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditing(null);
    setReason('');
    setForm(blankPurchase());
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const payload = {
      supplierId: form.supplierId || undefined,
      storeId: form.storeId || undefined,
      discount: Number(form.discount) || 0,
      paidAmount: form.paidAmount === '' ? undefined : Number(form.paidAmount),
      paymentMethod: form.paymentMethod,
      notes: form.notes || undefined,
      lines: form.lines
        .filter((ln) => ln.itemId)
        .map((ln) => {
          const serials = (ln.serials ?? '')
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          return {
            itemId: ln.itemId,
            storeId: ln.storeId || undefined,
            quantity: Number(ln.quantity),
            unitPrice: Number(ln.unitPrice),
            serials: serials.length > 0 ? serials : undefined,
          };
        }),
    };
    if (payload.lines.length === 0) {
      setSubmitError('At least one line is required');
      return;
    }
    try {
      if (editing) {
        // Same bill number. The stock IN is mirrored back, the journal entry
        // balanced out, the serial intake withdrawn, and the corrected bill
        // re-posted — then the weighted-average cost is re-derived.
        await api.patch(`/purchases/${editing.id}`, { ...payload, reason });
      } else {
        await api.post('/purchases', payload);
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
        <h2>Purchases</h2>
        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <ImportCsv
            schema={IMPORT_SCHEMAS.purchases}
            onDone={() => {
              reload();
              reloadItems();
            }}
          />
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + New Purchase
          </button>
        </div>
      </div>

      <div className="chip chip-info" style={{ marginBottom: 12 }}>
        Bills aren't paid one-for-one. To pay suppliers, use the{' '}
        <strong>Payments</strong> tab — the <strong>Supplier Ledger</strong> tab
        shows the net balance you owe.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>
            {editing ? `Correct ${editing.billNo}` : 'New Purchase'}
          </h3>
          {editing && (
            <EditVoucherBar
              label={editing.billNo}
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
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
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
              <label>Default Store (per-line below can override)</label>
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
              <label>Payment Method</label>
              <select
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm({ ...form, paymentMethod: e.target.value })
                }
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
                <option value="CREDIT">Credit</option>
              </select>
            </div>
          </div>

          <table style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Store</th>
                <th className="right">Qty</th>
                <th className="right">Unit Price</th>
                <th className="right">Line Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((ln, idx) => {
                const lineItem = items.find((i) => i.id === ln.itemId);
                const showSerialBox =
                  lineItem && lineItem.tracksSerials !== false;
                return (
                <Fragment key={idx}>
                <tr>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        value={ln.itemId}
                        onChange={(e) => onItemChange(idx, e.target.value)}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <option value="">— Select —</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                            {i.modelNo ? ` — ${i.modelNo}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Create a new item without leaving this form"
                        onClick={() => openNewItem(idx)}
                      >
                        + New
                      </button>
                    </div>
                  </td>
                  <td>
                    <select
                      value={ln.storeId}
                      onChange={(e) =>
                        updateLine(idx, { storeId: e.target.value })
                      }
                      title="Which store these go to"
                    >
                      <option value="">
                        {form.storeId ? '— Default —' : '— None —'}
                      </option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
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
                      onClick={() => removeLine(idx)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
                {showSerialBox && (
                  <tr>
                    <td colSpan={6} style={{ paddingTop: 0 }}>
                      <label
                        style={{ fontSize: 11.5, color: 'var(--text-muted)' }}
                        title="One serial per line (or comma-separated). Leave blank to capture serials at POS time instead."
                      >
                        Serials for this line (optional ·{' '}
                        {ln.serials
                          ? ln.serials.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length
                          : 0}{' '}
                        / {ln.quantity})
                      </label>
                      <textarea
                        rows={Math.min(3, Number(ln.quantity) || 1)}
                        value={ln.serials}
                        onChange={(e) =>
                          updateLine(idx, { serials: e.target.value })
                        }
                        placeholder={
                          'e.g. SN-A12B34\nSN-A12B35\nSN-A12B36 (one per line)'
                        }
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
              })}
            </tbody>
          </table>
          <button type="button" className="btn" onClick={addLine}>
            + Add Line
          </button>

          <div className="form-row" style={{ marginTop: 16 }}>
            <div>
              <label>Discount</label>
              <input
                type="number"
                step="any"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
            </div>
            <div>
              <label>Total</label>
              <input value={total.toFixed(2)} readOnly />
            </div>
            <div>
              <label>Net</label>
              <input value={net.toFixed(2)} readOnly />
            </div>
            <div>
              <label>Paid Amount</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={form.paidAmount}
                onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary">
            Save Purchase
          </button>{' '}
          <button type="button" className="btn" onClick={cancelForm}>
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : purchases.length === 0 ? (
        <div className="card muted center">No purchases yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th className="right">Total</th>
              <th className="right">Net</th>
              <th className="right">Paid at bill</th>
              <th>Method</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td>{p.billNo}</td>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td>{p.supplier?.name ?? '—'}</td>
                <td className="right">{Number(p.totalAmount).toFixed(2)}</td>
                <td className="right">{Number(p.netAmount).toFixed(2)}</td>
                <td className="right">{Number(p.paidAmount ?? 0).toFixed(2)}</td>
                <td>{p.paymentMethod}</td>
                <td className="right">
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {!p.reversedAt && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => startEdit(p)}
                      >
                        Edit
                      </button>
                    )}
                    <a
                      className="btn btn-sm"
                      href={`#/print/purchase/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Print
                    </a>
                    <ReverseAction
                      endpoint="/purchases"
                      row={p}
                      label={`bill ${p.billNo}`}
                      onDone={reload}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {newItemFor !== null && (
        <div className="modal-backdrop" onClick={closeNewItem}>
          <form
            className="modal"
            onSubmit={saveNewItem}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Quick add item</h3>
            {newItemError && (
              <div className="alert alert-error">{newItemError}</div>
            )}
            <div className="form-row">
              <div>
                <label>Model No</label>
                <input
                  autoFocus
                  value={newItem.modelNo}
                  onChange={(e) =>
                    setNewItem({ ...newItem, modelNo: e.target.value })
                  }
                  placeholder="e.g. WRG-475LP"
                />
              </div>
              <div>
                <label>Name (optional, defaults to Model No)</label>
                <input
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label>Brand</label>
                <select
                  value={newItem.brandId}
                  onChange={(e) =>
                    setNewItem({ ...newItem, brandId: e.target.value })
                  }
                >
                  <option value="">— None —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>SKU (auto-derived if blank)</label>
                <input
                  value={newItem.sku}
                  onChange={(e) =>
                    setNewItem({ ...newItem, sku: e.target.value })
                  }
                />
              </div>
              <div>
                <label>Barcode</label>
                <input
                  value={newItem.barcode}
                  onChange={(e) =>
                    setNewItem({ ...newItem, barcode: e.target.value })
                  }
                />
              </div>
              <div>
                <label>Purchase price</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newItem.purchasePrice}
                  onChange={(e) =>
                    setNewItem({ ...newItem, purchasePrice: e.target.value })
                  }
                />
              </div>
              <div>
                <label>Sale price</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newItem.salePrice}
                  onChange={(e) =>
                    setNewItem({ ...newItem, salePrice: e.target.value })
                  }
                />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingNewItem}
              >
                {savingNewItem ? 'Saving…' : 'Save item & use on this line'}
              </button>
              <button type="button" className="btn" onClick={closeNewItem}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
