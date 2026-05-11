import { NavLink, Outlet } from 'react-router-dom';
import Brand from './Brand';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';

const sections = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', end: true, icon: 'dashboard' }],
  },
  {
    label: 'Point of Sale',
    items: [{ to: '/pos', label: 'POS Terminal', icon: 'pos' }],
  },
  {
    label: 'Setup',
    items: [{ to: '/master', label: 'Master Data', icon: 'master' }],
  },
  {
    label: 'Transactions',
    items: [
      { to: '/sales', label: 'Sales', icon: 'cart' },
      { to: '/sale-returns', label: 'Sale Returns', icon: 'rotate' },
      { to: '/purchases', label: 'Purchases', icon: 'package' },
      { to: '/purchase-returns', label: 'Purchase Returns', icon: 'packageX' },
      { to: '/receipts', label: 'Receipts', icon: 'arrowDownCircle' },
      { to: '/payments', label: 'Payments', icon: 'arrowUpCircle' },
    ],
  },
  {
    label: 'Inventory',
    items: [{ to: '/stock', label: 'Stock', icon: 'boxes' }],
  },
];

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          {sections.map((s) => (
            <div key={s.label} className="nav-section">
              <div className="nav-section-label">{s.label}</div>
              {s.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  <Icon name={n.icon} size={18} />
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>© {new Date().getFullYear()} Hassan Electronics</span>
          <ThemeToggle />
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
