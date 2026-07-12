import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import LedgerView from '../components/LedgerView';
import AgingPanel from '../components/AgingPanel';
import WhatsAppButton from '../components/WhatsAppButton';
import { balanceReminderMessage } from '../utils/whatsapp';

export default function CustomerLedger() {
  const { id } = useParams();
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(id ?? '');
  const [ledger, setLedger] = useState(null);
  const [aging, setAging] = useState(null);
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
    setAging(null);
    api
      .get(`/reports/customer-ledger/${selectedId}`)
      .then((r) => setLedger(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load ledger'));
    api
      .get(`/reports/ar-aging/${selectedId}`)
      .then((r) => setAging(r.data))
      .catch(() => setAging({ lines: [] }));
  }, [selectedId]);

  const customer = customers.find((c) => c.id === selectedId);
  // Outstanding A/R = sum of unpaid invoice residuals (same source the aging
  // panel renders). Drives the balance-reminder WhatsApp button below.
  const outstanding = (aging?.lines ?? []).reduce(
    (s, l) => s + Number(l.residualAmount || 0),
    0,
  );

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
              {outstanding > 0.005 && (
                <div style={{ marginTop: 10 }}>
                  <WhatsAppButton
                    phone={customer.phone}
                    message={balanceReminderMessage({
                      name: customer.name,
                      balance: outstanding,
                    })}
                    label="Send balance reminder"
                  />
                </div>
              )}
            </div>
          )}
          {aging && aging.lines && aging.lines.length > 0 && (
            <AgingPanel
              title="Outstanding invoices"
              lines={aging.lines}
              numKey="invoiceNo"
              showPromiseColumn
            />
          )}
          <LedgerView title={customer?.name} party={customer} ledger={ledger} />
        </>
      ) : (
        <div className="card muted center">Select a customer to view their ledger.</div>
      )}
    </>
  );
}
