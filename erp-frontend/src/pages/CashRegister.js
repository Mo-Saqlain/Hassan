import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';

const CATEGORIES = [
  { value: 'EXPENSE', label: 'Expense (rent, tea, transport…)' },
  { value: 'MISC', label: 'Miscellaneous (unclassified)' },
  { value: 'OPENING', label: 'Opening adjustment' },
  { value: 'CLOSING_ADJUSTMENT', label: 'Closing adjustment' },
  { value: 'OTHER', label: 'Other' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (n) =>
  Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function CashRegister() {
  const [date, setDate] = useState(todayStr());
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { data: accounts } = useResource('/accounts');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/cash-register/day?date=${date}`);
      setBook(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const [showEntry, setShowEntry] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);

  const removeEntry = async (row) => {
    if (row.source !== 'CASH_ENTRY') {
      alert(
        'This row is generated from a sale/purchase/voucher/transfer — delete it from its source page instead.',
      );
      return;
    }
    if (!window.confirm('Delete this cash book entry?')) return;
    try {
      await api.delete(`/cash-register/${row.sourceId}`);
      load();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    }
  };

  const session = book?.session;
  const isToday = date === todayStr();

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Cash book — {date}</h1>
          <p>Session-based daily till · running balance per row</p>
        </div>
        <div className="row">
          {!session && isToday && (
            <button
              className="btn btn-primary"
              onClick={() => setShowOpen(true)}
            >
              ▶ Open Today's Register
            </button>
          )}
          {session?.status === 'OPEN' && (
            <button className="btn" onClick={() => setShowClose(true)}>
              ■ Close Register
            </button>
          )}
          {session && (
            <button
              className="btn btn-primary"
              onClick={() => setShowEntry(true)}
              disabled={session.status === 'CLOSED'}
              title={
                session.status === 'CLOSED'
                  ? 'Register is closed for this date'
                  : ''
              }
            >
              + New Entry
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div>
            <label>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!session && book && (
        <div className="card" style={{ marginTop: 12 }}>
          {isToday ? (
            <>
              <h3 style={{ marginTop: 0 }}>Register not opened for today</h3>
              <p className="muted">
                Expected opening cash (carried over from prior day):{' '}
                <strong>{fmt(book.expectedOpening)}</strong>. Click{' '}
                <em>Open Today's Register</em> to count physical cash and start
                the day.
              </p>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>No session for {date}</h3>
              <p className="muted">
                This date didn't have a register session opened. Computed
                opening from prior-day balance:{' '}
                <strong>{fmt(book.expectedOpening)}</strong>.
              </p>
            </>
          )}
        </div>
      )}

      {showOpen && (
        <OpenSessionForm
          accounts={accounts}
          date={date}
          expectedOpening={book?.expectedOpening ?? 0}
          onCancel={() => setShowOpen(false)}
          onSaved={() => {
            setShowOpen(false);
            load();
          }}
        />
      )}

      {showClose && session && (
        <CloseSessionForm
          session={session}
          expectedClosing={book?.closing ?? 0}
          onCancel={() => setShowClose(false)}
          onSaved={() => {
            setShowClose(false);
            load();
          }}
        />
      )}

      {showEntry && (
        <EntryForm
          accounts={accounts}
          date={date}
          onCancel={() => setShowEntry(false)}
          onSaved={() => {
            setShowEntry(false);
            load();
          }}
        />
      )}

      {book && !loading && (
        <>
          {book.warnings.map((w, i) => (
            <div key={i} className="alert alert-error" style={{ marginTop: 12 }}>
              ⚠ {w.message}
            </div>
          ))}

          {session && (
            <div className="session-bar" style={{ marginTop: 12, marginBottom: 18 }}>
              <div className="dot" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  Session {session.sessionDate} · {session.status}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                  Expected opening {fmt(session.expectedOpening)} · Actual{' '}
                  {fmt(session.actualOpening)} ·{' '}
                  {Number(session.openingDifference) === 0
                    ? 'no difference'
                    : `${fmt(session.openingDifference)} diff`}
                  {session.status === 'CLOSED' && (
                    <>
                      {' · Closing '}
                      {fmt(session.actualClosing ?? 0)} (
                      {Number(session.closingDifference ?? 0) === 0
                        ? 'matched'
                        : `${fmt(session.closingDifference ?? 0)} diff`}
                      )
                    </>
                  )}
                </div>
              </div>
              <span
                className={
                  'chip ' +
                  (Number(session.openingDifference) === 0 &&
                  (session.status !== 'CLOSED' ||
                    Number(session.closingDifference ?? 0) === 0)
                    ? 'chip-success'
                    : 'chip-warn')
                }
              >
                {Number(session.openingDifference) === 0 &&
                (session.status !== 'CLOSED' ||
                  Number(session.closingDifference ?? 0) === 0)
                  ? 'No discrepancies'
                  : 'Variance recorded'}
              </span>
            </div>
          )}

          <div className="grid-stat" style={{ marginTop: 12 }}>
            <Stat label="Opening Cash" value={book.opening} />
            <Stat label="Cash In" value={book.totals.in} positive />
            <Stat label="Cash Out" value={book.totals.out} negative />
            <Stat
              label="Closing Cash"
              value={book.closing}
              accent={book.closing < 0}
            />
          </div>

          {book.entries.length === 0 ? (
            <div className="card muted center" style={{ marginTop: 12 }}>
              No cash activity on this date.
            </div>
          ) : (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Ref</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="right">In</th>
                  <th className="right">Out</th>
                  <th className="right">Running</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {book.entries.map((r, i) => (
                  <tr key={i}>
                    <td>{new Date(r.time).toLocaleTimeString()}</td>
                    <td>{r.ref}</td>
                    <td>
                      <span
                        className={`badge ${
                          r.category === 'MISC' ? 'badge-red' : 'badge-gray'
                        }`}
                      >
                        {r.category}
                      </span>
                    </td>
                    <td>{r.description}</td>
                    <td className="right">
                      {r.direction === 'IN' ? fmt(r.amount) : ''}
                    </td>
                    <td className="right">
                      {r.direction === 'OUT' ? fmt(r.amount) : ''}
                    </td>
                    <td className="right">{fmt(r.runningBalance)}</td>
                    <td className="right">
                      {r.source === 'CASH_ENTRY' && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => removeEntry(r)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value, positive, negative, accent }) {
  const orb = positive
    ? '#34d399'
    : negative
    ? '#fda4af'
    : accent
    ? '#fda4af'
    : 'var(--gradient-primary)';
  return (
    <div className="stat">
      <div className="stat-orb" style={{ '--stat-orb': orb, opacity: 0.35 }} />
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        <span className="unit">Rs</span>
        {fmt(value)}
      </div>
    </div>
  );
}

function OpenSessionForm({ accounts, date, expectedOpening, onCancel, onSaved }) {
  const [actual, setActual] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [transfer, setTransfer] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    notes: '',
  });
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const isDirty =
    actual !== '' ||
    notes !== '' ||
    transferOpen ||
    transfer.fromAccountId !== '' ||
    transfer.toAccountId !== '' ||
    transfer.amount !== '' ||
    transfer.notes !== '';
  useUnsavedChangesPrompt(isDirty);

  const actualNum = Number(actual || 0);
  const diff = actualNum - Number(expectedOpening);
  const shortfall = diff < 0 ? -diff : 0;
  const overage = diff > 0 ? diff : 0;

  const cashAccounts = accounts.filter((a) => a.type === 'CASH');
  // Default the transfer destination to the first cash account (most shops have one).
  useEffect(() => {
    if (transferOpen && !transfer.toAccountId && cashAccounts.length > 0) {
      setTransfer((t) => ({ ...t, toAccountId: cashAccounts[0].id }));
    }
    if (transferOpen && !transfer.amount && shortfall > 0) {
      setTransfer((t) => ({ ...t, amount: shortfall.toFixed(2) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferOpen]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const payload = {
      sessionDate: date,
      actualOpening: actualNum,
      notes: notes || undefined,
    };
    if (transferOpen) {
      if (
        !transfer.fromAccountId ||
        !transfer.toAccountId ||
        !transfer.amount ||
        transfer.fromAccountId === transfer.toAccountId
      ) {
        setErr('Transfer requires distinct from/to accounts and a positive amount');
        setSaving(false);
        return;
      }
      payload.transfer = {
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        amount: Number(transfer.amount),
        notes: transfer.notes || undefined,
      };
    }
    try {
      await api.post('/cash-register/sessions/open', payload);
      onSaved();
    } catch (e2) {
      setErr(e2.uiMessage ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Open Cash Register — {date}</h3>
      {err && <div className="alert alert-error">{err}</div>}

      <div className="form-row">
        <div>
          <label>Expected Opening (from prior day)</label>
          <input value={fmt(expectedOpening)} readOnly />
        </div>
        <div>
          <label>Actual Cash Counted *</label>
          <input
            type="number"
            step="any"
            min="0"
            required
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label>Difference</label>
          <input
            value={fmt(diff)}
            readOnly
            style={{
              color:
                diff === 0
                  ? 'var(--text)'
                  : diff < 0
                  ? 'var(--danger)'
                  : 'var(--success)',
            }}
          />
        </div>
      </div>

      {shortfall > 0 && (
        <div className="alert alert-error" style={{ marginTop: 8 }}>
          Short by <strong>{fmt(shortfall)}</strong>. You can book a transfer
          (e.g. from Capital → Cash) to cover it before opening, or just open
          with the actual amount and reconcile later.
        </div>
      )}
      {overage > 0 && (
        <div className="alert alert-error" style={{ marginTop: 8 }}>
          Over by <strong>{fmt(overage)}</strong> — recount before opening, or
          book the surplus as a Capital injection / cash IN entry afterwards.
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={transferOpen}
            onChange={(e) => setTransferOpen(e.target.checked)}
          />
          Book a fund transfer along with opening
        </label>
      </div>

      {transferOpen && (
        <div className="form-row" style={{ marginTop: 8 }}>
          <div>
            <label>From Account *</label>
            <select
              required={transferOpen}
              value={transfer.fromAccountId}
              onChange={(e) =>
                setTransfer({ ...transfer, fromAccountId: e.target.value })
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
              required={transferOpen}
              value={transfer.toAccountId}
              onChange={(e) =>
                setTransfer({ ...transfer, toAccountId: e.target.value })
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
              required={transferOpen}
              value={transfer.amount}
              onChange={(e) =>
                setTransfer({ ...transfer, amount: e.target.value })
              }
            />
          </div>
          <div>
            <label>Transfer Notes</label>
            <input
              value={transfer.notes}
              onChange={(e) =>
                setTransfer({ ...transfer, notes: e.target.value })
              }
              placeholder="e.g. Capital injection to cover shortfall"
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <label>Opening Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth recording about today's opening?"
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Opening…' : '▶ Open Register'}
        </button>{' '}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CloseSessionForm({ session, expectedClosing, onCancel, onSaved }) {
  const [actual, setActual] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  useUnsavedChangesPrompt(actual !== '' || notes !== '');

  const actualNum = Number(actual || 0);
  const diff = actualNum - Number(expectedClosing);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      await api.post(`/cash-register/sessions/${session.sessionDate}/close`, {
        actualClosing: actualNum,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e2) {
      setErr(e2.uiMessage ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Close Cash Register — {session.sessionDate}</h3>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="form-row">
        <div>
          <label>Expected Closing</label>
          <input value={fmt(expectedClosing)} readOnly />
        </div>
        <div>
          <label>Actual Cash Counted *</label>
          <input
            type="number"
            step="any"
            min="0"
            required
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label>Difference</label>
          <input
            value={fmt(diff)}
            readOnly
            style={{
              color:
                diff === 0
                  ? 'var(--text)'
                  : diff < 0
                  ? 'var(--danger)'
                  : 'var(--success)',
            }}
          />
        </div>
      </div>
      <div>
        <label>Closing Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Closing…' : '■ Close Register'}
        </button>{' '}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EntryForm({ accounts, date, onCancel, onSaved }) {
  const blankEntry = useMemo(
    () => ({
      entryDate: date,
      direction: 'OUT',
      category: 'EXPENSE',
      amount: '',
      accountId: '',
      description: '',
      notes: '',
    }),
    [date],
  );
  const [form, setForm] = useState(blankEntry);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(blankEntry),
    [form, blankEntry],
  );
  useUnsavedChangesPrompt(isDirty);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      await api.post('/cash-register', {
        entryDate: form.entryDate,
        direction: form.direction,
        category: form.category,
        amount: Number(form.amount),
        accountId: form.accountId || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
      });
      onSaved();
    } catch (e2) {
      setErr(e2.uiMessage ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>New Cash Entry</h3>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="form-row">
        <div>
          <label>Date *</label>
          <input
            type="date"
            required
            value={form.entryDate}
            onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
          />
        </div>
        <div>
          <label>Direction *</label>
          <select
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
          >
            <option value="OUT">Cash Out (paid out)</option>
            <option value="IN">Cash In (received)</option>
          </select>
        </div>
        <div>
          <label>Category *</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
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
        <div>
          <label>Account</label>
          <select
            value={form.accountId}
            onChange={(e) => setForm({ ...form, accountId: e.target.value })}
          >
            <option value="">— None —</option>
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
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What was this cash for?"
        />
      </div>
      <div>
        <label>Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      {form.category === 'MISC' && (
        <div className="alert alert-error" style={{ marginTop: 8 }}>
          Heads up: Miscellaneous entries are flagged in the day's report.
          Prefer a specific category if you can identify what this cash was
          spent on.
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Entry'}
        </button>{' '}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
