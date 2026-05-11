import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState({
    items: 0,
    customers: 0,
    suppliers: 0,
    sales: 0,
    purchases: 0,
    stockOnHand: 0,
    lowStockCount: 0,
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [items, customers, suppliers, sales, purchases, summary] =
          await Promise.all([
            api.get('/items'),
            api.get('/customers'),
            api.get('/suppliers'),
            api.get('/sales'),
            api.get('/purchases'),
            api.get('/stock/summary'),
          ]);
        const stockOnHand = summary.data.reduce(
          (sum, r) => sum + Number(r.onHand),
          0,
        );
        const lowStockCount = summary.data.filter(
          (r) => r.minStockLevel > 0 && Number(r.onHand) < r.minStockLevel,
        ).length;
        setStats({
          items: items.data.length,
          customers: customers.data.length,
          suppliers: suppliers.data.length,
          sales: sales.data.length,
          purchases: purchases.data.length,
          stockOnHand,
          lowStockCount,
        });
      } catch (e) {
        setError(e.uiMessage ?? 'Failed to load dashboard');
      }
    })();
  }, []);

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="stats-grid">
        <StatCard label="Items" value={stats.items} />
        <StatCard label="Customers" value={stats.customers} />
        <StatCard label="Suppliers" value={stats.suppliers} />
        <StatCard label="Sales" value={stats.sales} />
        <StatCard label="Purchases" value={stats.purchases} />
        <StatCard label="Total Stock On Hand" value={stats.stockOnHand} />
        <StatCard label="Low-Stock Items" value={stats.lowStockCount} />
      </div>
    </>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
