import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import LedgerView from '../components/LedgerView';

export default function AccountLedger() {
  const { id } = useParams();
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(id ?? '');
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/reports/account-balances')
      .then((r) => {
        setAccounts(r.data);
        if (!selectedId && r.data.length > 0) {
          setSelectedId(r.data[0].id);
        }
      })
      .catch((e) => setError(e.uiMessage ?? 'Failed to load accounts'));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLedger(null);
    setError(null);
    api
      .get(`/reports/account-ledger/${selectedId}`)
      .then((r) => setLedger(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load ledger'));
  }, [selectedId]);

  const account = accounts.find((a) => a.id === selectedId);

  const grouped = groupByType(accounts);

  return (
    <>
      <div className="page-header">
        <h2>Account Ledger</h2>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ width: 320 }}
        >
          <option value="">— Select account —</option>
          {Object.entries(grouped).map(([type, list]) => (
            <optgroup key={type} label={type}>
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({Number(a.balance).toFixed(2)})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {selectedId ? (
        <>
          {account && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>
                {account.name}{' '}
                <span className="badge badge-gray">{account.type}</span>
              </h3>
              <div className="muted" style={{ fontSize: 13 }}>
                {account.bank ?? '—'}
                {account.accountNumber ? ` · ${account.accountNumber}` : ''}
              </div>
            </div>
          )}
          <LedgerView title={account?.name} party={account} ledger={ledger} />
        </>
      ) : (
        <div className="card muted center">
          Select an account to view its ledger. All Bank, Wallet, Cash, Capital
          and Credit accounts are listed.
        </div>
      )}
    </>
  );
}

function groupByType(accounts) {
  const order = ['CASH', 'BANK', 'WALLET', 'CAPITAL', 'CREDIT'];
  const out = {};
  for (const t of order) out[t] = [];
  for (const a of accounts) {
    if (!out[a.type]) out[a.type] = [];
    out[a.type].push(a);
  }
  // Drop empty groups.
  for (const k of Object.keys(out)) {
    if (out[k].length === 0) delete out[k];
  }
  return out;
}
