import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';

/**
 * Bill-book style Sales Voucher: customer + lines + N payment splits, all
 * posted atomically through `POST /sales/voucher` (see SalesService.
 * createFromVoucher). The page is intentionally stateless on the server —
 * unlike POS Terminal which keeps a session-scoped cart, this one builds
 * the whole submission client-side and writes it in one shot.
 *
 * Layout follows the hand-drawn wireframe the shop owner sketched:
 *   ┌─ Customer + invoice meta ─────────────────────────┐
 *   ├─ Line items (Item · Qty · Unit · Line total) ─────┤
 *   ├─ Payment splits (Account · Amount · Reference) ───┤
 *   │  Net · Paid · Residual footer ─────────────────────┤
 *   └─ Submit · Cancel ─────────────────────────────────┘
 *
 * The Submit button is disabled until the lines have a non-zero net AND
 * the splits sum does not exceed the net (server enforces the same check,
 * this is just immediate feedback).
 */
export default function SalesVoucher() {
  const navigate = useNavigate();
  const { data: items } = useResource('/items');
  const { data: customers } = useResource('/reports/customer-balances');
  const { data: accounts } = useResource('/accounts');

  const blankLine = () => ({
    itemId: '',
    quantity: 1,
    unitPrice: 0,
    _key: Math.random().toString(36).slice(2),
  });
  const blankSplit = () => ({
    accountId: '',
    amount: 0,
    reference: '',
    _key: Math.random().toString(36).slice(2),
  });

  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [lines, setLines] = useState([blankLine()]);
  const [splits, setSplits] = useState([blankSplit()]);
  const [submitErr, setSubmitErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-pin the cash drawer / on-hand account on the first split so an
  // owner who's doing a quick walk-in voucher only has to type the amount.
  const cashAccount = useMemo(
    () => accounts.find((a) => a.type === 'CASH' || a.type === 'CASH_ON_HAND'),
    [accounts],
  );

  const grossTotal = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + Number(l.unitPrice || 0) * Number(l.quantity || 0),
        0,
      ),
    [lines],
  );
  const netTotal = Math.max(0, Number((grossTotal - (discount || 0)).toFixed(2)));
  const paidTotal = useMemo(
    () => splits.reduce((s, x) => s + Number(x.amount || 0), 0),
    [splits],
  );
  const residual = Number((netTotal - paidTotal).toFixed(2));
  const overSplit = paidTotal > netTotal + 0.005;
  const canSubmit =
    !submitting &&
    netTotal > 0 &&
    lines.every((l) => l.itemId && l.quantity > 0 && l.unitPrice >= 0) &&
    !overSplit &&
    splits.every((sp) => Number(sp.amount || 0) === 0 || sp.accountId);

  const isDirty =
    netTotal > 0 ||
    customerId !== '' ||
    notes.trim() !== '' ||
    lines.some((l) => l.itemId) ||
    splits.some((sp) => Number(sp.amount || 0) > 0);
  useUnsavedChangesPrompt(isDirty);

  const updateLine = (key, patch) => {
    setLines((prev) =>
      prev.map((l) => (l._key === key ? { ...l, ...patch } : l)),
    );
  };

  // Pulling default sale price the moment the cashier picks an item means
  // the row is usable without typing — they only override the price when
  // there's a relationship discount in play.
  const pickItem = (key, itemId) => {
    const it = items.find((i) => i.id === itemId);
    updateLine(key, {
      itemId,
      unitPrice: it ? Number(it.salePrice ?? 0) : 0,
    });
  };

  const addLine = () => setLines((prev) => [...prev, blankLine()]);
  const removeLine = (key) =>
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((l) => l._key !== key),
    );

  const updateSplit = (key, patch) => {
    setSplits((prev) =>
      prev.map((s) => (s._key === key ? { ...s, ...patch } : s)),
    );
  };
  const addSplit = () => setSplits((prev) => [...prev, blankSplit()]);
  const removeSplit = (key) =>
    setSplits((prev) =>
      prev.length === 1 ? prev : prev.filter((s) => s._key !== key),
    );

  const reset = () => {
    setCustomerId('');
    setNotes('');
    setDiscount(0);
    setLines([blankLine()]);
    setSplits([blankSplit()]);
    setSubmitErr(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitErr(null);
    setSubmitting(true);
    try {
      const payload = {
        customerId: customerId || undefined,
        discount: Number(discount) || 0,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        })),
        splits: splits
          .filter((sp) => Number(sp.amount || 0) > 0)
          .map((sp) => ({
            accountId: sp.accountId,
            amount: Number(sp.amount),
            reference: sp.reference.trim() || undefined,
          })),
      };
      const r = await api.post('/sales/voucher', payload);
      const saleId = r.data?.sale?.id;
      const invoiceNo = r.data?.sale?.invoiceNo;
      reset();
      if (saleId) {
        // Open the printable invoice straight away. The shop owner's
        // expectation from the wireframe was: Submit → bill prints.
        window.open(`#/print/sale/${saleId}`, '_blank');
      }
      // Drop the cashier on Sales history so they see the row they just
      // wrote — with the new invoice highlighted by the URL fragment.
      navigate(`/sales${invoiceNo ? `#${invoiceNo}` : ''}`);
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Voucher save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const customerBalance = useMemo(() => {
    if (!customerId) return null;
    const c = customers.find((x) => x.id === customerId);
    return c ? Number(c.balance ?? 0) : null;
  }, [customerId, customers]);

  return (
    <form className="card" onSubmit={submit}>
      <div className="page-header" style={{ margin: 0 }}>
        <h2 style={{ margin: 0 }}>Sales Voucher</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          Bill-book entry · multi-tender · atomic
        </span>
      </div>

      {submitErr && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          {submitErr}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Customer
        </div>
        <div className="form-row">
          <div>
            <label>Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Walk-in</option>
              {customers.map((c) => {
                const bal = Number(c.balance ?? 0);
                const tail =
                  bal === 0
                    ? ''
                    : bal > 0
                    ? ` — owes ${bal.toFixed(2)}`
                    : ` — credit ${Math.abs(bal).toFixed(2)}`;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {tail}
                  </option>
                );
              })}
            </select>
            {customerBalance !== null && customerBalance !== 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {customerBalance > 0
                  ? `Open A/R balance: ${customerBalance.toFixed(2)}`
                  : `Customer holds credit: ${Math.abs(customerBalance).toFixed(
                      2,
                    )}`}
              </div>
            )}
          </div>
          <div>
            <label>Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reference / remarks (optional)"
            />
          </div>
        </div>
      </section>

      {/* ── Line items ───────────────────────────────────────────────── */}
      <section style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Items
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '45%' }}>Item</th>
              <th className="right" style={{ width: 100 }}>
                Qty
              </th>
              <th className="right" style={{ width: 140 }}>
                Unit price
              </th>
              <th className="right" style={{ width: 140 }}>
                Line total
              </th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const lineTotal =
                Number(line.unitPrice || 0) * Number(line.quantity || 0);
              return (
                <tr key={line._key}>
                  <td>
                    <select
                      value={line.itemId}
                      onChange={(e) => pickItem(line._key, e.target.value)}
                    >
                      <option value="">— Pick item —</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                          {it.sku ? ` · ${it.sku}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="right"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line._key, {
                          quantity: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="right"
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(line._key, {
                          unitPrice:
                            e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {lineTotal.toFixed(2)}
                  </td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => removeLine(line._key)}
                      disabled={lines.length === 1}
                      title={
                        lines.length === 1
                          ? 'Need at least one line'
                          : 'Remove this line'
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" onClick={addLine}>
            + Add item
          </button>
        </div>
      </section>

      {/* ── Discount + net summary ───────────────────────────────────── */}
      <section style={{ marginTop: 18 }}>
        <div className="form-row">
          <div>
            <label>Discount on bill</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="right"
              value={discount}
              onChange={(e) =>
                setDiscount(e.target.value === '' ? 0 : Number(e.target.value))
              }
            />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Gross
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18 }}>
              {grossTotal.toFixed(2)}
            </div>
          </div>
          <div style={{ alignSelf: 'end' }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Net
            </div>
            <div
              style={{
                fontVariantNumeric: 'tabular-nums',
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              {netTotal.toFixed(2)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Payment splits ───────────────────────────────────────────── */}
      <section style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Payment splits
          <span
            className="muted"
            style={{ fontWeight: 400, marginLeft: 8, fontSize: 11 }}
          >
            (cash, bank, wallet — any combination; residual posts to A/R)
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '35%' }}>Account</th>
              <th className="right" style={{ width: 160 }}>
                Amount
              </th>
              <th>Reference</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {splits.map((split, idx) => (
              <tr key={split._key}>
                <td>
                  <select
                    value={split.accountId}
                    onChange={(e) =>
                      updateSplit(split._key, { accountId: e.target.value })
                    }
                  >
                    <option value="">
                      {idx === 0 && cashAccount ? cashAccount.name : '— Pick account —'}
                    </option>
                    {accounts
                      .filter((a) =>
                        ['CASH', 'BANK', 'WALLET', 'CASH_ON_HAND'].includes(a.type),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type})
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="right"
                    value={split.amount}
                    onChange={(e) =>
                      updateSplit(split._key, {
                        amount: e.target.value === '' ? 0 : Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    value={split.reference}
                    onChange={(e) =>
                      updateSplit(split._key, { reference: e.target.value })
                    }
                    placeholder='e.g. "Cheque 12345", "JazzCash 9F2K"'
                  />
                </td>
                <td className="right">
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => removeSplit(split._key)}
                    disabled={splits.length === 1}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" onClick={addSplit}>
            + Add split
          </button>
        </div>
      </section>

      {/* ── Footer totals + submit ───────────────────────────────────── */}
      <section
        style={{
          marginTop: 22,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 28,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Net
          </div>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18 }}>
            {netTotal.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Paid (splits)
          </div>
          <div
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 18,
              color: overSplit ? 'var(--danger)' : undefined,
            }}
          >
            {paidTotal.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Residual (to A/R)
          </div>
          <div
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 22,
              fontWeight: 700,
              color:
                residual < 0
                  ? 'var(--danger)'
                  : residual === 0
                  ? 'var(--success)'
                  : 'var(--warn)',
            }}
          >
            {residual.toFixed(2)}
          </div>
        </div>
      </section>

      {overSplit && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          Splits exceed the net total by {(paidTotal - netTotal).toFixed(2)}.
          Drop a split or raise the line totals.
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!canSubmit}
          title={
            !canSubmit
              ? 'Pick at least one item and make sure splits do not exceed net'
              : ''
          }
        >
          {submitting ? 'Saving…' : 'Save voucher'}
        </button>
        <button type="button" className="btn" onClick={reset}>
          Reset
        </button>
      </div>
    </form>
  );
}
