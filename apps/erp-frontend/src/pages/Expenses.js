import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import ReverseAction from '../components/ReverseAction';
import EditVoucherBar from '../components/EditVoucherBar';

/**
 * Shop operating expenses (tea, rent, utilities, transport, …). Each expense
 * is recorded as an OUT payment tagged with an expense-category account, so it
 * posts Dr <expense category> / Cr <paid-from account> — the cash/bank drops,
 * the cost lands on the Income Statement, and (when paid from a CASH account)
 * it flows through the daily cash book automatically.
 */
export default function Expenses() {
  const { data: payments, loading, error, reload } = useResource(
    '/payments?direction=OUT',
  );
  const { data: accounts } = useResource('/accounts');

  const categories = useMemo(
    () =>
      (accounts ?? []).filter(
        (a) => a.accountCategory === 'EXPENSE' && !a.isControl && a.isActive,
      ),
    [accounts],
  );
  const paidFromAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (a) => ['CASH', 'BANK', 'WALLET'].includes(a.type) && a.isActive,
      ),
    [accounts],
  );
  const defaultCash = useMemo(
    () => paidFromAccounts.find((a) => a.type === 'CASH'),
    [paidFromAccounts],
  );

  // Only expense vouchers (tagged with an expense category) belong here;
  // supplier / customer payments live on the Payments page.
  const expenses = useMemo(
    () => (payments ?? []).filter((p) => p.expenseAccountId),
    [payments],
  );

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState('');
  const blank = () => ({
    expenseAccountId: '',
    accountId: '',
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

  const openForm = () => {
    setForm({ ...blank(), accountId: defaultCash?.id ?? '' });
    setSubmitError(null);
    setShowForm(true);
  };

  const startEdit = (v) => {
    setEditing(v);
    setReason('');
    setSubmitError(null);
    setForm({
      ...blank(),
      expenseAccountId: v.expenseAccountId ?? '',
      accountId: v.accountId ?? '',
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
      direction: 'OUT',
      expenseAccountId: form.expenseAccountId,
      accountId: form.accountId,
      amount: Number(form.amount),
      notes: form.notes || undefined,
    };
    try {
      if (editing) {
        // Same voucher number; the old journal entry is balanced out and the
        // corrected one posted server-side.
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

  const total = useMemo(
    () =>
      expenses
        .filter((e) => !e.reversedAt)
        .reduce((s, e) => s + Number(e.amount), 0),
    [expenses],
  );

  return (
    <>
      <div className="page-header">
        <h2>Expenses</h2>
        <button className="btn btn-primary" onClick={openForm}>
          + New Expense
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {categories.length === 0 && !loading && (
        <div className="card muted">
          No expense categories found. They seed automatically on the backend —
          restart the backend if this persists.
        </div>
      )}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>
            {editing ? `Correct ${editing.voucherNo}` : 'New Expense'}
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
          <div className="form-row">
            <div>
              <label>Category *</label>
              <select
                required
                value={form.expenseAccountId}
                onChange={(e) =>
                  setForm({ ...form, expenseAccountId: e.target.value })
                }
              >
                <option value="">— Select —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Paid from *</label>
              <select
                required
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              >
                <option value="">— Select —</option>
                {paidFromAccounts.map((a) => (
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
            <label>Description / notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Evening tea for staff"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Save correction' : 'Save Expense'}
            </button>{' '}
            <button type="button" className="btn" onClick={cancelForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : expenses.length === 0 ? (
        <div className="card muted center">No expenses recorded yet.</div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="eyebrow" style={{ marginRight: 8 }}>
              Total (excl. reversed)
            </div>
            <div className="mono" style={{ fontWeight: 600 }}>
              Rs {total.toFixed(2)}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Date</th>
                <th>Category</th>
                <th>Paid from</th>
                <th className="right">Amount</th>
                <th>Notes</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((v) => (
                <tr key={v.id} style={v.reversedAt ? { opacity: 0.5 } : undefined}>
                  <td>{v.voucherNo}</td>
                  <td>{new Date(v.createdAt).toLocaleString()}</td>
                  <td>{v.expenseAccount?.name ?? '—'}</td>
                  <td>{v.account?.name ?? '—'}</td>
                  <td className="right mono">{Number(v.amount).toFixed(2)}</td>
                  <td>{v.notes ?? ''}</td>
                  <td className="right">
                    {!v.reversedAt && (
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
                      label={`expense ${v.voucherNo}`}
                      onDone={reload}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
