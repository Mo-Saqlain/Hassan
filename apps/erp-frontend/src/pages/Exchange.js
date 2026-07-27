import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';

const emptyLine = () => ({ itemId: '', quantity: 1, unitPrice: 0, serials: '' });

const lineSum = (lines) =>
  lines.reduce((s, ln) => s + Number(ln.quantity ?? 0) * Number(ln.unitPrice ?? 0), 0);

/**
 * Exchange — return old goods and buy new in ONE atomic step. The customer's
 * give-back value carries onto the new purchase; they pay only the difference.
 * Supports the manufacturer-claim case (returned unit went to the company, not
 * our shelf) with an optional supplier warranty credit. Posts to POST /exchanges.
 */
export default function Exchange() {
  const { data: items } = useResource('/items');
  const { data: customers } = useResource('/customers');
  const { data: suppliers } = useResource('/suppliers');
  const { data: stores } = useResource('/stores');
  const { data: accounts } = useResource('/accounts');

  const blankForm = () => ({
    customerId: '',
    storeId: '',
    returnDisposition: 'RESTOCK',
    returnReason: '',
    returnLines: [emptyLine()],
    supplierId: '',
    supplierCreditAmount: '',
    supplierCreditReason: '',
    saleLines: [emptyLine()],
    paymentAccountId: '',
    paymentAmount: '',
    notes: '',
  });
  const [form, setForm] = useState(blankForm());
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(blankForm()),
    [form],
  );
  useUnsavedChangesPrompt(isDirty);

  const itemById = useMemo(() => {
    const m = new Map();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  const isCompanyClaim = form.returnDisposition === 'CLAIMED_TO_COMPANY';

  const returnTotal = useMemo(() => lineSum(form.returnLines), [form.returnLines]);
  const newTotal = useMemo(() => lineSum(form.saleLines), [form.saleLines]);
  const cash = Number(form.paymentAmount ?? 0);
  const suggestedCash = Math.max(0, Number((newTotal - returnTotal).toFixed(2)));
  const difference = Number((newTotal - returnTotal - cash).toFixed(2));

  // ── line editing helpers (which = 'returnLines' | 'saleLines') ──────────
  const updateLine = (which, idx, patch) =>
    setForm((f) => ({
      ...f,
      [which]: f[which].map((ln, i) => (i === idx ? { ...ln, ...patch } : ln)),
    }));
  const addLine = (which) =>
    setForm((f) => ({ ...f, [which]: [...f[which], emptyLine()] }));
  const removeLine = (which, idx) =>
    setForm((f) => ({
      ...f,
      [which]: f[which].length > 1 ? f[which].filter((_, i) => i !== idx) : f[which],
    }));
  const onItemChange = (which, idx, itemId) => {
    const it = itemById.get(itemId);
    updateLine(which, idx, { itemId, unitPrice: it ? Number(it.salePrice) : 0 });
  };

  const toPayloadLines = (lines) =>
    lines
      .filter((ln) => ln.itemId)
      .map((ln) => {
        const serials = (ln.serials ?? '')
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        return {
          itemId: ln.itemId,
          quantity: Number(ln.quantity),
          unitPrice: Number(ln.unitPrice),
          serials: serials.length > 0 ? serials : undefined,
        };
      });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setResult(null);

    const returnLines = toPayloadLines(form.returnLines);
    const saleLines = toPayloadLines(form.saleLines);
    if (returnLines.length === 0) {
      setSubmitError('Add at least one item being returned.');
      return;
    }
    if (saleLines.length === 0) {
      setSubmitError('Add at least one new item being bought.');
      return;
    }
    const cashToSend = form.paymentAmount === '' ? suggestedCash : cash;
    if (cashToSend > 0 && !form.paymentAccountId) {
      setSubmitError('Pick the account the cash difference lands in.');
      return;
    }

    const payload = {
      customerId: form.customerId || undefined,
      storeId: form.storeId || undefined,
      returnDisposition: form.returnDisposition,
      returnReason: form.returnReason || undefined,
      returnLines,
      saleLines,
      paymentAmount: cashToSend > 0 ? cashToSend : undefined,
      paymentAccountId: cashToSend > 0 ? form.paymentAccountId : undefined,
      notes: form.notes || undefined,
    };
    if (isCompanyClaim && Number(form.supplierCreditAmount) > 0) {
      if (!form.supplierId) {
        setSubmitError('Pick the supplier/company that credited you.');
        return;
      }
      payload.supplierCredit = {
        supplierId: form.supplierId,
        amount: Number(form.supplierCreditAmount),
        reason: form.supplierCreditReason || undefined,
      };
    }

    try {
      const res = await api.post('/exchanges', payload);
      setResult(res.data);
      setForm(blankForm());
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Exchange failed');
    }
  };

  const renderLineTable = (which, serialPlaceholder) => (
    <>
      <table style={{ marginBottom: 8 }}>
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
          {form[which].map((ln, idx) => {
            const it = itemById.get(ln.itemId);
            const showSerials = it && it.tracksSerials !== false;
            return (
              <tr key={idx}>
                <td>
                  <select
                    value={ln.itemId}
                    onChange={(e) => onItemChange(which, idx, e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  {showSerials && (
                    <input
                      value={ln.serials}
                      onChange={(e) =>
                        updateLine(which, idx, { serials: e.target.value })
                      }
                      placeholder={serialPlaceholder}
                      style={{
                        marginTop: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                      }}
                    />
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={ln.quantity}
                    onChange={(e) =>
                      updateLine(which, idx, { quantity: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    value={ln.unitPrice}
                    onChange={(e) =>
                      updateLine(which, idx, { unitPrice: e.target.value })
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
                    onClick={() => removeLine(which, idx)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm" onClick={() => addLine(which)}>
        + Add Line
      </button>
    </>
  );

  return (
    <>
      <div className="page-header">
        <h2>Exchange</h2>
      </div>

      {result && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <strong>Exchange done.</strong> Give-back {result.saleReturn?.returnNo}
          {result.purchaseReturn
            ? ` · supplier credit ${result.purchaseReturn.returnNo} (Rs ${Number(
                result.supplierCredit,
              ).toFixed(2)})`
            : ''}{' '}
          · new invoice {result.sale?.invoiceNo}. {' '}
          {Math.abs(Number(result.difference)) < 0.005
            ? 'Balances netted to zero.'
            : Number(result.difference) > 0
              ? `Customer still owes Rs ${Number(result.difference).toFixed(2)}.`
              : `Customer has Rs ${Math.abs(Number(result.difference)).toFixed(
                  2,
                )} credit remaining.`}
        </div>
      )}

      <form className="card" onSubmit={submit}>
        {submitError && <div className="alert alert-error">{submitError}</div>}

        {/* Header */}
        <div className="form-row">
          <div>
            <label>Customer</label>
            <select
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
            >
              <option value="">— None —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Recommended — the give-back credit tracks on the customer ledger.
            </div>
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
        </div>

        {/* Return leg */}
        <h3 style={{ marginBottom: 4 }}>Goods coming back</h3>
        <div className="form-row" style={{ marginBottom: 8 }}>
          <div>
            <label>Where do they go?</label>
            <select
              value={form.returnDisposition}
              onChange={(e) =>
                setForm({ ...form, returnDisposition: e.target.value })
              }
            >
              <option value="RESTOCK">Back to our shelf (restock)</option>
              <option value="CLAIMED_TO_COMPANY">
                Went to the company (warranty claim — don't restock)
              </option>
            </select>
          </div>
          <div>
            <label>Reason</label>
            <input
              value={form.returnReason}
              onChange={(e) =>
                setForm({ ...form, returnReason: e.target.value })
              }
              placeholder="e.g. faulty, wrong model"
            />
          </div>
        </div>
        {renderLineTable('returnLines', 'Serial(s) coming back (comma-sep)')}

        {/* Supplier warranty credit — only for company claims */}
        {isCompanyClaim && (
          <div
            className="card"
            style={{ marginTop: 12, background: 'var(--surface-elev)' }}
          >
            <h4 style={{ marginTop: 0 }}>Supplier / company credit (optional)</h4>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              If the company credited your account for the faulty unit, record it
              here — it reduces what you owe that supplier. No stock moves.
            </div>
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
                <label>Credit amount</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.supplierCreditAmount}
                  onChange={(e) =>
                    setForm({ ...form, supplierCreditAmount: e.target.value })
                  }
                  placeholder="e.g. your cost the company refunded"
                />
              </div>
              <div>
                <label>Note</label>
                <input
                  value={form.supplierCreditReason}
                  onChange={(e) =>
                    setForm({ ...form, supplierCreditReason: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* New goods leg */}
        <h3 style={{ marginBottom: 4, marginTop: 16 }}>New goods going out</h3>
        {renderLineTable('saleLines', 'Serial(s) of the new unit(s) (comma-sep)')}

        {/* Money summary */}
        <div
          className="form-row"
          style={{ marginTop: 16, alignItems: 'flex-end' }}
        >
          <div>
            <label>Cash collected now</label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.paymentAmount}
              placeholder={suggestedCash.toFixed(2)}
              onChange={(e) =>
                setForm({ ...form, paymentAmount: e.target.value })
              }
            />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Suggested difference: {suggestedCash.toFixed(2)} (blank = suggested)
            </div>
          </div>
          <div>
            <label>Into account</label>
            <select
              value={form.paymentAccountId}
              onChange={(e) =>
                setForm({ ...form, paymentAccountId: e.target.value })
              }
            >
              <option value="">— Select —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Notes</label>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <div
          className="card"
          style={{ marginTop: 12, background: 'var(--surface-elev)' }}
        >
          <table className="compact">
            <tbody>
              <tr>
                <td>Give-back credit</td>
                <td className="right mono">{returnTotal.toFixed(2)}</td>
              </tr>
              {isCompanyClaim && Number(form.supplierCreditAmount) > 0 && (
                <tr>
                  <td>Supplier credit (to you)</td>
                  <td className="right mono">
                    {Number(form.supplierCreditAmount).toFixed(2)}
                  </td>
                </tr>
              )}
              <tr>
                <td>New goods total</td>
                <td className="right mono">{newTotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Cash collected</td>
                <td className="right mono">
                  {(form.paymentAmount === '' ? suggestedCash : cash).toFixed(2)}
                </td>
              </tr>
              <tr style={{ fontWeight: 600 }}>
                <td>
                  {difference > 0.005
                    ? 'Customer still owes'
                    : difference < -0.005
                      ? 'Customer credit remaining'
                      : 'Net difference'}
                </td>
                <td className="right mono">{Math.abs(difference).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary">
            Complete Exchange
          </button>{' '}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setForm(blankForm());
              setResult(null);
              setSubmitError(null);
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </>
  );
}
