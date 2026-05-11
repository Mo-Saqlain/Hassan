import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import LedgerView from '../components/LedgerView';

export default function CustomerLedger() {
  const { id } = useParams();
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(id ?? '');
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/customers').then((r) => {
      setCustomers(r.data);
      if (!selectedId && r.data.length > 0) {
        setSelectedId(r.data[0].id);
      }
    });
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLedger(null);
    api
      .get(`/reports/customer-ledger/${selectedId}`)
      .then((r) => setLedger(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load ledger'));
  }, [selectedId]);

  const customer = customers.find((c) => c.id === selectedId);

  return (
    <>
      <div className="page-header">
        <h2>Customer Ledger</h2>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ width: 280 }}
        >
          <option value="">— Select customer —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {selectedId ? (
        <>
          {customer && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>{customer.name}</h3>
              <div className="muted" style={{ fontSize: 13 }}>
                {customer.phone ?? '—'} · {customer.email ?? '—'}
              </div>
              {customer.address && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {customer.address}
                </div>
              )}
            </div>
          )}
          <LedgerView title={customer?.name} party={customer} ledger={ledger} />
        </>
      ) : (
        <div className="card muted center">Select a customer to view their ledger.</div>
      )}
    </>
  );
}
