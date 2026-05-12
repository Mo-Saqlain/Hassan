import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import ExportButtons from '../components/ExportButtons';

const fmt = (n) => Number(n ?? 0).toFixed(2);

export default function EmployeeLedger() {
  const { id } = useParams();
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(id ?? '');
  const [ledger, setLedger] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/employees')
      .then((r) => {
        setEmployees(r.data);
        if (!selectedId && r.data.length > 0) setSelectedId(r.data[0].id);
      })
      .catch((e) => setError(e.uiMessage ?? 'Failed to load employees'));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLedger(null);
    setError(null);
    const q = [];
    if (from) q.push(`from=${from}`);
    if (to) q.push(`to=${to}`);
    api
      .get(`/reports/employee-ledger/${selectedId}${q.length ? '?' + q.join('&') : ''}`)
      .then((r) => setLedger(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load ledger'));
  }, [selectedId, from, to]);

  const employee = employees.find((e) => e.id === selectedId);

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Employee ledger</h1>
          <p>Salary, advances, expenses, and incentives earned with running balance.</p>
        </div>
        {ledger && (
          <ExportButtons
            filename={`employee_ledger_${employee?.name?.replace(/\s+/g, '_') ?? selectedId}`}
            title={`${employee?.name ?? 'Employee'} — ledger`}
            subtitle={`Opening ${fmt(ledger.openingBalance)} · Closing ${fmt(ledger.closingBalance)} · Incentives earned ${fmt(ledger.incentivesEarned)}`}
            columns={[
              { key: 'date', label: 'Date', value: (e) => new Date(e.date).toLocaleDateString() },
              { key: 'ref', label: 'Ref' },
              { key: 'type', label: 'Type' },
              { key: 'description', label: 'Description' },
              { key: 'debit', label: 'Earned', align: 'right', value: (e) => (e.debit ? fmt(e.debit) : '') },
              { key: 'credit', label: 'Paid', align: 'right', value: (e) => (e.credit ? fmt(e.credit) : '') },
              { key: 'balance', label: 'Balance', align: 'right', value: (e) => fmt(e.balance) },
            ]}
            rows={ledger.entries}
          />
        )}
      </div>

      <div className="ledger-toolbar">
        <select
          className="select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ maxWidth: 280 }}
        >
          <option value="">— Select employee —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} {e.role ? `· ${e.role}` : ''}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="date"
          placeholder="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={{ maxWidth: 160 }}
        />
        <input
          className="input"
          type="date"
          placeholder="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{ maxWidth: 160 }}
        />
      </div>

      {error && <div className="chip chip-danger">{error}</div>}

      {!selectedId ? (
        <div className="card muted center">Select an employee to view their ledger.</div>
      ) : !ledger ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div className="panel-stripe" style={{ marginBottom: 18 }}>
            <div>
              <div className="label">Opening balance</div>
              <div className="v num">Rs {fmt(ledger.openingBalance)}</div>
            </div>
            <div>
              <div className="label">Incentives earned · this period</div>
              <div
                className="v num"
                style={{
                  background: 'var(--gradient-primary)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Rs {fmt(ledger.incentivesEarned)}
              </div>
            </div>
            <div>
              <div className="label">
                Current balance ·{' '}
                {ledger.closingBalance > 0
                  ? 'we owe employee'
                  : ledger.closingBalance < 0
                  ? 'employee owes us'
                  : 'settled'}
              </div>
              <div
                className="v num"
                style={{
                  color:
                    ledger.closingBalance > 0
                      ? '#34d399'
                      : ledger.closingBalance < 0
                      ? '#fda4af'
                      : 'var(--text)',
                }}
              >
                Rs {fmt(Math.abs(ledger.closingBalance))}
              </div>
            </div>
          </div>

          {ledger.entries.length === 0 ? (
            <div className="card muted center">
              No transactions in this period. Add salary, advances, expenses,
              or incentive rules to populate the ledger.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ref</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th className="num">Earned</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.map((e, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {new Date(e.date).toLocaleDateString()}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {e.ref}
                      </td>
                      <td>
                        <span className="chip">{e.type.replace('_', ' ')}</span>
                      </td>
                      <td>{e.description}</td>
                      <td className="num" style={{ color: e.debit ? '#34d399' : 'var(--text-faint)' }}>
                        {e.debit ? fmt(e.debit) : '—'}
                      </td>
                      <td className="num" style={{ color: e.credit ? '#fda4af' : 'var(--text-faint)' }}>
                        {e.credit ? fmt(e.credit) : '—'}
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {fmt(e.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
