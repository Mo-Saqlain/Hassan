import { NavLink, Outlet } from 'react-router-dom';

const sections = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', end: true }],
  },
  {
    label: 'Point of Sale',
    items: [{ to: '/pos', label: 'POS Terminal' }],
  },
  {
    label: 'Setup',
    items: [{ to: '/master', label: 'Master Data' }],
  },
  {
    label: 'Transactions',
    items: [
      { to: '/sales', label: 'Sales' },
      { to: '/sale-returns', label: 'Sale Returns' },
      { to: '/purchases', label: 'Purchases' },
      { to: '/purchase-returns', label: 'Purchase Returns' },
      { to: '/receipts', label: 'Receipts' },
      { to: '/payments', label: 'Payments' },
    ],
  },
  {
    label: 'Inventory',
    items: [{ to: '/stock', label: 'Stock' }],
  },
];

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>ERP · Phase 1</h1>
        <nav>
          {sections.map((s) => (
            <div key={s.label} className="nav-section">
              <div className="nav-section-label">{s.label}</div>
              {s.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
