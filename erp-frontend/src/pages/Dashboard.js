import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Icon from '../components/Icon';

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
        <StatCard icon="box"             color="var(--tile-items)"     label="Items"               value={stats.items} />
        <StatCard icon="users"           color="var(--tile-customers)" label="Customers"           value={stats.customers} />
        <StatCard icon="truck"           color="var(--tile-suppliers)" label="Suppliers"           value={stats.suppliers} />
        <StatCard icon="cart"            color="var(--primary)"        label="Sales"               value={stats.sales} />
        <StatCard icon="package"         color="var(--tile-categories)" label="Purchases"          value={stats.purchases} />
        <StatCard icon="boxes"           color="var(--tile-accounts)"  label="Total Stock On Hand" value={stats.stockOnHand} />
        <StatCard icon="bolt"            color="var(--danger)"         label="Low-Stock Items"     value={stats.lowStockCount} />
      </div>
    </>
  );
}

function StatCard({ icon, color, label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-icon" style={{ background: color }}>
        <Icon name={icon} size={22} />
      </span>
      <div className="stat-body">
        <div className="label">{label}</div>
        <div className="value">{value}</div>
      </div>
    </div>
  );
}
