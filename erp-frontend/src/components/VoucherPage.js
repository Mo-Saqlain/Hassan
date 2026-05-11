import { useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

/**
 * direction = 'IN' (Receipt from customer) or 'OUT' (Payment to supplier)
 */
export default function VoucherPage({ direction }) {
  const title = direction === 'IN' ? 'Receipts' : 'Payments';
  const partyLabel = direction === 'IN' ? 'Customer' : 'Supplier';
  const partyKey = direction === 'IN' ? 'customerId' : 'supplierId';
  const partyPath = direction === 'IN' ? '/customers' : '/suppliers';

  const { data: vouchers, loading, error, reload } = useResource(
    `/payments?direction=${direction}`,
  );
  const { data: accounts } = useResource('/accounts');
  const { data: parties } = useResource(partyPath);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    accountId: '',
    [partyKey]: '',
    amount: '',
    notes: '',
  });
  const [submitError, setSubmitError] = useState(null);

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
      await api.post('/payments', payload);
      setShowForm(false);
      setForm({ accountId: '', [partyKey]: '', amount: '', notes: '' });
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
            New {direction === 'IN' ? 'Receipt' : 'Payment'} Voucher
          </h3>
          {submitError && <div className="alert alert-error">{submitError}</div>}
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
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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
              onClick={() => setShowForm(false)}
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
              <th>{partyLabel}</th>
              <th>Account</th>
              <th className="right">Amount</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td>{v.voucherNo}</td>
                <td>{new Date(v.createdAt).toLocaleString()}</td>
                <td>
                  {direction === 'IN'
                    ? v.customer?.name ?? '—'
                    : v.supplier?.name ?? '—'}
                </td>
                <td>{v.account?.name ?? '—'}</td>
                <td className="right">{Number(v.amount).toFixed(2)}</td>
                <td>{v.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
