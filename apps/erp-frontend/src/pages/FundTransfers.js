import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import ReverseAction from '../components/ReverseAction';
import EditVoucherBar from '../components/EditVoucherBar';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function FundTransfers() {
  const { data: transfers, loading, error, reload } = useResource(
    '/fund-transfers',
  );
  const { data: accounts } = useResource('/accounts');

  const [show, setShow] = useState(false);
  const [form, setForm] = useState(blank());
  const [submitErr, setSubmitErr] = useState(null);
  // The transfer being corrected, or null when entering a new one.
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState('');

  const isDirty = useMemo(
    () => show && JSON.stringify(form) !== JSON.stringify(blank()),
    [show, form],
  );
  useUnsavedChangesPrompt(isDirty);

  const startEdit = (t) => {
    setEditing(t);
    setReason('');
    setSubmitErr(null);
    setForm({
      transferDate: t.transferDate ?? todayStr(),
      fromAccountId: t.fromAccountId ?? '',
      toAccountId: t.toAccountId ?? '',
      amount: String(t.amount ?? ''),
      notes: t.notes ?? '',
    });
    setShow(true);
  };

  const cancel = () => {
    setShow(false);
    setEditing(null);
    setReason('');
    setForm(blank());
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitErr(null);
    if (form.fromAccountId === form.toAccountId) {
      setSubmitErr('Source and destination must differ');
      return;
    }
    const payload = {
      transferDate: form.transferDate,
      fromAccountId: form.fromAccountId,
      toAccountId: form.toAccountId,
      amount: Number(form.amount),
      notes: form.notes || undefined,
    };
    try {
      if (editing) {
        // Same transfer number and row; the old journal entry is balanced out
        // and the corrected one posted server-side.
        await api.patch(`/fund-transfers/${editing.id}`, { ...payload, reason });
      } else {
        await api.post('/fund-transfers', payload);
      }
      cancel();
      reload();
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Save failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Fund Transfers</h2>
        <button className="btn btn-primary" onClick={() => setShow(true)}>
          + New Transfer
        </button>
      </div>

      <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        Move money between your own accounts (Capital → Cash, Cash → Bank,
        Bank → Credit Card, etc.). Customer/supplier payments belong on the
        Receipts / Payments pages.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {show && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>
            {editing ? `Correct ${editing.transferNo}` : 'New Transfer'}
          </h3>
          {editing && (
            <EditVoucherBar
              label={editing.transferNo}
              reason={reason}
              onReason={setReason}
              onCancel={cancel}
              editCount={Number(editing.editCount ?? 0)}
            />
          )}
          {submitErr && <div className="alert alert-error">{submitErr}</div>}
          <div className="form-row">
            <div>
              <label>Date *</label>
              <input
                type="date"
                required
                value={form.transferDate}
                onChange={(e) =>
                  setForm({ ...form, transferDate: e.target.value })
                }
              />
            </div>
            <div>
              <label>From Account *</label>
              <select
                required
                value={form.fromAccountId}
                onChange={(e) =>
                  setForm({ ...form, fromAccountId: e.target.value })
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
              <label>To Account *</label>
              <select
                required
                value={form.toAccountId}
                onChange={(e) =>
                  setForm({ ...form, toAccountId: e.target.value })
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
              placeholder="e.g. Capital injection for register opening"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Save correction' : 'Save Transfer'}
            </button>{' '}
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : transfers.length === 0 ? (
        <div className="card muted center">No transfers yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Transfer #</th>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th className="right">Amount</th>
              <th>Notes</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id}>
                <td>{t.transferNo}</td>
                <td>{t.transferDate}</td>
                <td>
                  {t.fromAccount?.name ?? '—'}{' '}
                  <span className="muted">({t.fromAccount?.type})</span>
                </td>
                <td>
                  {t.toAccount?.name ?? '—'}{' '}
                  <span className="muted">({t.toAccount?.type})</span>
                </td>
                <td className="right">{Number(t.amount).toFixed(2)}</td>
                <td>{t.notes ?? ''}</td>
                <td className="right">
                  {!t.reversedAt && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => startEdit(t)}
                      >
                        Edit
                      </button>{' '}
                    </>
                  )}
                  <ReverseAction
                    endpoint="/fund-transfers"
                    row={t}
                    label={`transfer ${t.transferNo}`}
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

function blank() {
  return {
    transferDate: todayStr(),
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    notes: '',
  };
}
