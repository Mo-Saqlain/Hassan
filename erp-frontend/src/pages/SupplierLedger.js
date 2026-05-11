import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import LedgerView from '../components/LedgerView';

export default function SupplierLedger() {
  const { id } = useParams();
  const [suppliers, setSuppliers] = useState([]);
  const [selectedId, setSelectedId] = useState(id ?? '');
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/suppliers').then((r) => {
      setSuppliers(r.data);
      if (!selectedId && r.data.length > 0) {
        setSelectedId(r.data[0].id);
      }
    });
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLedger(null);
    api
      .get(`/reports/supplier-ledger/${selectedId}`)
      .then((r) => setLedger(r.data))
      .catch((e) => setError(e.uiMessage ?? 'Failed to load ledger'));
  }, [selectedId]);

  const supplier = suppliers.find((s) => s.id === selectedId);

  return (
    <>
      <div className="page-header">
        <h2>Supplier Ledger</h2>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ width: 280 }}
        >
          <option value="">— Select supplier —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {selectedId ? (
        <>
          {supplier && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>{supplier.name}</h3>
              <div className="muted" style={{ fontSize: 13 }}>
                {supplier.phone ?? '—'} · {supplier.email ?? '—'}
              </div>
              {supplier.address && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {supplier.address}
                </div>
              )}
            </div>
          )}
          <LedgerView title={supplier?.name} party={supplier} ledger={ledger} />
        </>
      ) : (
        <div className="card muted center">Select a supplier to view their ledger.</div>
      )}
    </>
  );
}
