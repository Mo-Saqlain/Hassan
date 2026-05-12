import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Brand from './Brand';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';

/**
 * `label: null` renders the items without a category heading — used for
 * lone entries so we don't slap a one-item section header above them.
 * Multi-item groups keep their headings.
 *
 * `color` paints the icon chip beside the label; it's passed to the CSS
 * via a `--c` custom property so a single rule does all the gradient work.
 */
const sections = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', end: true, icon: 'dashboard', color: '#6366f1' },
      { to: '/pos', label: 'POS Terminal', icon: 'pos', color: '#ef4444' },
      { to: '/master', label: 'Master Data', icon: 'master', color: '#8b5cf6' },
      { to: '/transactions', label: 'Transactions', icon: 'cart', color: '#0ea5e9' },
      { to: '/cash-register', label: 'Cash Book', icon: 'cash', color: '#14b8a6' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/stock', label: 'Stock Summary', icon: 'boxes', color: '#f97316' },
      { to: '/stock-ledger', label: 'Stock Ledger', icon: 'warehouse', color: '#06b6d4' },
    ],
  },
  {
    label: 'Ledgers',
    items: [
      { to: '/customer-ledger', label: 'Customer Ledger', icon: 'book', color: '#22c55e' },
      { to: '/supplier-ledger', label: 'Supplier Ledger', icon: 'book', color: '#f59e0b' },
      { to: '/account-ledger', label: 'Account Ledger', icon: 'card', color: '#14b8a6' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: '/financials', label: 'Financial Statements', icon: 'chartBar', color: '#a855f7' },
      { to: '/incentives', label: 'Incentives', icon: 'trophy', color: '#eab308' },
    ],
  },
];

const COLLAPSED_KEY = 'hassan-sidebar-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Persist desktop collapsed preference.
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Auto-close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const shellClasses = [
    'app-shell',
    collapsed ? 'sidebar-collapsed' : '',
    mobileOpen ? 'mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClasses}>
      {/* Mobile hamburger — CSS hides it on desktop */}
      <button
        type="button"
        className="mobile-menu-btn"
        aria-label="Open menu"
        onClick={() => setMobileOpen(true)}
      >
        <Icon name="menu" size={20} />
      </button>

      {/* Mobile backdrop */}
      <div
        className="mobile-backdrop"
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      <aside className="sidebar">
        <div className="sidebar-top">
          <Brand collapsed={collapsed} />
          <button
            type="button"
            className="sidebar-close-btn"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav>
          {sections.map((s, i) => (
            <div key={s.label ?? `_${i}`} className="nav-section">
              {!collapsed && s.label && (
                <div className="nav-section-label">{s.label}</div>
              )}
              {s.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  title={collapsed ? n.label : undefined}
                  style={n.color ? { '--c': n.color } : undefined}
                >
                  <span className="nav-icon" aria-hidden>
                    <Icon name={n.icon} size={16} />
                  </span>
                  <span className="nav-text">{n.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <span className="footer-copy">
              © {new Date().getFullYear()} Hassan Electronics
            </span>
          )}
          <div className="sidebar-controls">
            <button
              type="button"
              className="theme-toggle collapse-toggle"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
