import { useMemo, useState } from 'react';
import { useResource } from '../hooks/useResource';

export default function Sales() {
  const { data: sales, loading, error } = useResource('/sales');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(
      (s) =>
        s.invoiceNo?.toLowerCase().includes(q) ||
        s.customer?.name?.toLowerCase().includes(q) ||
        s.paymentMethod?.toLowerCase().includes(q),
    );
  }, [sales, search]);

  return (
    <>
      <div className="page-header">
        <h2>Sales History</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="Search invoice, customer, method..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
        </div>
      </div>

      <div className="alert" style={{ background: 'var(--info-soft)', color: 'var(--info)', borderColor: 'var(--info)' }}>
        Sales are created at the POS terminal. This page is a read-only history.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card muted center">
          {search ? 'No sales match your search.' : 'No sales yet.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th className="right">Total</th>
              <th className="right">Net</th>
              <th className="right">Paid</th>
              <th className="right">Due</th>
              <th>Method</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const due = Number(s.dueAmount);
              return (
                <tr key={s.id}>
                  <td>{s.invoiceNo}</td>
                  <td>{new Date(s.createdAt).toLocaleString()}</td>
                  <td>{s.customer?.name ?? 'Walk-in'}</td>
                  <td className="right">{Number(s.totalAmount).toFixed(2)}</td>
                  <td className="right">{Number(s.netAmount).toFixed(2)}</td>
                  <td className="right">{Number(s.paidAmount).toFixed(2)}</td>
                  <td className="right">
                    {due > 0 ? (
                      <span className="badge badge-red">{due.toFixed(2)}</span>
                    ) : due < 0 ? (
                      <span className="muted">+{(-due).toFixed(2)}</span>
                    ) : (
                      <span className="badge badge-green">Settled</span>
                    )}
                  </td>
                  <td>{s.paymentMethod}</td>
                  <td className="right">
                    <a
                      className="btn btn-sm"
                      href={`#/print/sale/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Print
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
