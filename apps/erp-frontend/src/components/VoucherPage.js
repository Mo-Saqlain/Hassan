import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import ReverseAction from './ReverseAction';
import EditVoucherBar from './EditVoucherBar';

/**
 * direction = 'IN' (Receipt from customer) or 'OUT' (Payment to supplier)
 */
export default function VoucherPage({ direction }) {
  const title = direction === 'IN' ? 'Receipts' : 'Payments';

  // Money IN is always a receipt from a customer. Money OUT can settle a
  // supplier bill (A/P) OR be a loan / advance to a customer (money out that
  // they now owe us — e.g. lending a friend added as a customer).
  const [payTo, setPayTo] = useState('supplier'); // only meaningful for OUT
  const useCustomer = direction === 'IN' || payTo === 'customer';
  const partyKey = useCustomer ? 'customerId' : 'supplierId';
  const partyLabel = useCustomer ? 'Customer' : 'Supplier';

  const { data: allVouchers, loading, error, reload } = useResource(
    `/payments?direction=${direction}`,
  );
  // Expense vouchers (OUT payments tagged with an expense category) live on the
  // dedicated Expenses page — keep them out of the party-payment list here.
  const vouchers = useMemo(
    () => (allVouchers ?? []).filter((v) => !v.expenseAccountId),
    [allVouchers],
  );
  const { data: accounts } = useResource('/accounts');
  // Both party lists are cheap; fetch both so toggling payee is instant and
  // we don't juggle a changing resource path.
  const { data: customerBalances } = useResource('/reports/customer-balances');
  const { data: supplierBalances } = useResource('/reports/supplier-balances');
  const parties = useCustomer ? customerBalances : supplierBalances;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState('');
  const blank = () => ({
    accountId: '',
    customerId: '',
    supplierId: '',
    amount: '',
    notes: '',
  });
  const [form, setForm] = useState(blank());
  const [submitError, setSubmitError] = useState(null);

  const isDirty = useMemo(
    () => showForm && JSON.stringify(form) !== JSON.stringify(blank()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showForm, form],
  );
  useUnsavedChangesPrompt(isDirty);

  const switchPayTo = (t) => {
    setPayTo(t);
    setForm((f) => ({ ...f, customerId: '', supplierId: '' }));
  };

  const startEdit = (v) => {
    setEditing(v);
    setReason('');
    setSubmitError(null);
    // A voucher paid to a customer is an OUT with customerId set; switch the
    // Pay-to toggle to match what's actually on the row being corrected.
    if (direction === 'OUT') setPayTo(v.customerId ? 'customer' : 'supplier');
    setForm({
      ...blank(),
      accountId: v.accountId ?? '',
      customerId: v.customerId ?? '',
      supplierId: v.supplierId ?? '',
      amount: String(v.amount ?? ''),
      notes: v.notes ?? '',
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditing(null);
    setReason('');
    setForm(blank());
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const payload = {
      direction,
      accountId: form.accountId,
      [partyKey]: form[partyKey] || undefined,
      amount: Number(form.amount),
      notes: form.notes || undefined,
    };
    try {
      if (editing) {
        await api.patch(`/payments/${editing.id}`, { ...payload, reason });
      } else {
        await api.post('/payments', payload);
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
        <h2>{title}</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New {direction === 'IN' ? 'Receipt' : 'Payment'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>
            {editing
              ? `Correct ${editing.voucherNo}`
              : `New ${direction === 'IN' ? 'Receipt' : 'Payment'} Voucher`}
          </h3>
          {editing && (
            <EditVoucherBar
              label={editing.voucherNo}
              reason={reason}
              onReason={setReason}
              onCancel={cancelForm}
              editCount={Number(editing.editCount ?? 0)}
            />
          )}
          {submitError && <div className="alert alert-error">{submitError}</div>}
          {direction === 'OUT' && (
            <div style={{ marginBottom: 12 }}>
              <label>Pay to</label>
              <div className="row" style={{ gap: 18 }}>
                <label
                  style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}
                >
                  <input
                    type="radio"
                    name="payTo"
                    checked={payTo === 'supplier'}
                    onChange={() => switchPayTo('supplier')}
                  />
                  Supplier (pay a bill)
                </label>
                <label
                  style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}
                >
                  <input
                    type="radio"
                    name="payTo"
                    checked={payTo === 'customer'}
                    onChange={() => switchPayTo('customer')}
                  />
                  Customer (loan / advance)
                </label>
              </div>
            </div>
          )}
          <div className="form-row">
            <div>
              <label>{partyLabel} *</label>
              <select
                required
                value={form[partyKey]}
                onChange={(e) =>
                  setForm({ ...form, [partyKey]: e.target.value })
                }
              >
                <option value="">— Select —</option>
                {parties.map((p) => {
                  const bal = Number(p.balance ?? 0);
                  const label = bal === 0
                    ? p.name
                    : useCustomer
                    ? `${p.name} — ${bal > 0 ? `owes ${bal.toFixed(2)}` : `credit ${Math.abs(bal).toFixed(2)}`}`
                    : `${p.name} — ${bal > 0 ? `we owe ${bal.toFixed(2)}` : `they owe ${Math.abs(bal).toFixed(2)}`}`;
                  return (
                    <option key={p.id} value={p.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {form[partyKey] && (() => {
                const p = parties.find((x) => x.id === form[partyKey]);
                if (!p) return null;
                const bal = Number(p.balance ?? 0);
                if (bal === 0) {
                  return (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Settled.
                    </div>
                  );
                }
                const hint =
                  useCustomer
                    ? bal > 0
                      ? `Outstanding A/R: ${bal.toFixed(2)}`
                      : `Customer credit: ${Math.abs(bal).toFixed(2)}`
                    : bal > 0
                    ? `Outstanding A/P: ${bal.toFixed(2)}`
                    : `Supplier owes us: ${Math.abs(bal).toFixed(2)}`;
                return (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {hint}
                  </div>
                );
              })()}
            </div>
            <div>
              <label>Account *</label>
              <select
                required
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
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
              <label>Amount *</label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              Save Voucher
            </button>{' '}
            <button
              type="button"
              className="btn"
              onClick={cancelForm}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : vouchers.length === 0 ? (
        <div className="card muted center">No vouchers yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Voucher #</th>
              <th>Date</th>
              <th>{direction === 'IN' ? 'Customer' : 'Party'}</th>
              <th>Account</th>
              <th className="right">Amount</th>
              <th>Notes</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td>{v.voucherNo}</td>
                <td>{new Date(v.createdAt).toLocaleString()}</td>
                <td>{v.customer?.name ?? v.supplier?.name ?? '—'}</td>
                <td>{v.account?.name ?? '—'}</td>
                <td className="right">{Number(v.amount).toFixed(2)}</td>
                <td>{v.notes ?? ''}</td>
                <td className="right">
                  {/* A settlement receipt belongs to a sale's instalment
                      schedule — the API refuses to edit it here, so don't
                      offer the button. */}
                  {!v.reversedAt && v.referenceType !== 'SALE_COMMITMENT' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => startEdit(v)}
                      >
                        Edit
                      </button>{' '}
                    </>
                  )}
                  <ReverseAction
                    endpoint="/payments"
                    row={v}
                    label={`voucher ${v.voucherNo}`}
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
