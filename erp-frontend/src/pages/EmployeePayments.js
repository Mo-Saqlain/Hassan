import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import ExportButtons from '../components/ExportButtons';

const TYPES = [
  { value: 'SALARY', label: 'Salary' },
  { value: 'ADVANCE', label: 'Advance (employee borrows)' },
  { value: 'REIMBURSEMENT', label: 'Reimbursement (employee paid expense)' },
  { value: 'EXPENSE', label: 'Shop expense paid by employee' },
  { value: 'INCENTIVE_PAYOUT', label: 'Incentive payout' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function EmployeePayments() {
  const { data: txns, loading, error, reload } = useResource('/employee-transactions');
  const { data: employees } = useResource('/employees');
  const { data: accounts } = useResource('/accounts');

  const [show, setShow] = useState(false);
  const [form, setForm] = useState(blank());
  const [submitErr, setSubmitErr] = useState(null);

  const isDirty = useMemo(
    () => show && JSON.stringify(form) !== JSON.stringify(blank()),
    [show, form],
  );
  useUnsavedChangesPrompt(isDirty);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    try {
      await api.post('/employee-transactions', {
        employeeId: form.employeeId,
        type: form.type,
        transactionDate: form.transactionDate,
        amount: Number(form.amount),
        accountId: form.accountId || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
      });
      setShow(false);
      setForm(blank());
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete ${t.voucherNo}?`)) return;
    try {
      await api.delete(`/employee-transactions/${t.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Employee payments</h1>
          <p>Salary, advances, reimbursements, expenses, incentive payouts.</p>
        </div>
        <div className="row">
          <ExportButtons
            filename="employee_payments"
            title="Employee Payments"
            columns={[
              { key: 'transactionDate', label: 'Date' },
              { key: 'voucherNo', label: 'Voucher' },
              { key: 'employee', label: 'Employee', value: (r) => r.employee?.name ?? '' },
              { key: 'type', label: 'Type' },
              { key: 'amount', label: 'Amount', align: 'right' },
              { key: 'account', label: 'Account', value: (r) => r.account?.name ?? '' },
              { key: 'description', label: 'Notes' },
            ]}
            rows={txns}
          />
          <button className="btn btn-sm btn-primary" onClick={() => setShow(true)}>
            + New entry
          </button>
        </div>
      </div>

      {error && <div className="chip chip-danger">{error}</div>}

      {show && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>New employee transaction</h3>
          {submitErr && (
            <div className="chip chip-danger" style={{ marginBottom: 10 }}>
              {submitErr}
            </div>
          )}
          <div className="form-row">
            <div>
              <label>Employee *</label>
              <select
                className="select"
                required
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              >
                <option value="">— Select —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.role ? `· ${emp.role}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Type *</label>
              <select
                className="select"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Date *</label>
              <input
                className="input"
                type="date"
                required
                value={form.transactionDate}
                onChange={(e) =>
                  setForm({ ...form, transactionDate: e.target.value })
                }
              />
            </div>
            <div>
              <label>Amount *</label>
              <input
                className="input"
                type="number"
                step="any"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label>Account (for cash/bank flow)</label>
              <select
                className="select"
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              >
                <option value="">— None / out-of-pocket —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label>Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. April salary, advance against May pay, tea + transport reimbursement"
            />
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
              Save
            </button>{' '}
            <button type="button" className="btn" onClick={() => setShow(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : txns.length === 0 ? (
        <div className="card muted center">No transactions yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher</th>
                <th>Employee</th>
                <th>Type</th>
                <th>Description</th>
                <th>Account</th>
                <th className="num">Amount</th>
                <th className="num"></th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {t.transactionDate}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {t.voucherNo}
                  </td>
                  <td>{t.employee?.name ?? '—'}</td>
                  <td>
                    <span className="chip">{t.type.replace('_', ' ')}</span>
                  </td>
                  <td>{t.description ?? '—'}</td>
                  <td>{t.account?.name ?? '—'}</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {Number(t.amount).toFixed(2)}
                  </td>
                  <td className="num">
                    <button className="btn btn-sm btn-danger" onClick={() => remove(t)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function blank() {
  return {
    employeeId: '',
    type: 'SALARY',
    transactionDate: todayStr(),
    amount: '',
    accountId: '',
    description: '',
    notes: '',
  };
}
