import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Brand from './Brand';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import { api } from '../api/client';

/**
 * Sidebar nav definition. Each item carries:
 *   - `icon`   — Icon name (Lucide-style)
 *   - `colorVar` — CSS custom property in tokens.css used to tint the
 *                  icon chip and the active-row gradient bar
 *
 * Sections with `label: null` render no heading (used for top-level entries).
 */
const sections = [
  // ─── Top-level (no header) ──────────────────────────────────
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', end: true, icon: 'dashboard', colorVar: '--nav-dashboard' },
      { to: '/pos', label: 'POS Terminal', icon: 'pos', colorVar: '--nav-pos' },
      { to: '/cash-register', label: 'Cash Book', icon: 'cash', colorVar: '--nav-cash' },
    ],
  },
  // ─── Entity groups: each entity gets its full workflow together ──
  // ─── Entity groups (collapsible — click header to fold) ─────
  {
    label: 'Customer',
    items: [
      { to: '/customers', label: 'Customers', icon: 'user', colorVar: '--nav-ledger' },
      { to: '/receipts', label: 'Receipts (money in)', icon: 'card', colorVar: '--nav-ledger' },
      { to: '/customer-ledger', label: 'Customer Ledger', icon: 'ledger', colorVar: '--nav-ledger' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/sales', label: 'Sales History', icon: 'receipt', colorVar: '--nav-pos' },
      { to: '/sale-returns', label: 'Sale Returns', icon: 'transfer', colorVar: '--nav-pos' },
    ],
  },
  {
    label: 'Supplier',
    items: [
      { to: '/suppliers', label: 'Suppliers', icon: 'package', colorVar: '--nav-stock' },
      { to: '/brands', label: 'Brands', icon: 'sparkles', colorVar: '--nav-stock' },
      { to: '/payments', label: 'Payments (money out)', icon: 'card', colorVar: '--nav-stock' },
      { to: '/incentives', label: 'Supplier Incentives', icon: 'incentive', colorVar: '--nav-stock' },
      { to: '/supplier-ledger', label: 'Supplier Ledger', icon: 'ledger', colorVar: '--nav-stock' },
    ],
  },
  {
    label: 'Purchase',
    items: [
      { to: '/purchase-orders', label: 'Purchase Orders', icon: 'receipt', colorVar: '--nav-master' },
      { to: '/purchases', label: 'Purchases', icon: 'package', colorVar: '--nav-master' },
      { to: '/purchase-returns', label: 'Purchase Returns', icon: 'transfer', colorVar: '--nav-master' },
    ],
  },
  {
    label: 'Item',
    items: [
      { to: '/items', label: 'Items', icon: 'package', colorVar: '--nav-tx' },
      { to: '/categories', label: 'Categories', icon: 'master', colorVar: '--nav-tx' },
    ],
  },
  {
    label: 'Stock',
    items: [
      { to: '/stores', label: 'Stores', icon: 'stock', colorVar: '--nav-stock' },
      { to: '/stock', label: 'Stock Summary', icon: 'stock', colorVar: '--nav-stock' },
      { to: '/stock-ledger', label: 'Stock Ledger', icon: 'stock', colorVar: '--nav-stock' },
      { to: '/stock-transfers', label: 'Stock Transfers', icon: 'transfer', colorVar: '--nav-stock' },
      { to: '/damaged-goods', label: 'Damaged Goods', icon: 'packageX', colorVar: '--nav-stock' },
    ],
  },
  {
    label: 'Employee',
    items: [
      { to: '/employees', label: 'Employees', icon: 'user', colorVar: '--nav-pos' },
      { to: '/attendance', label: 'Attendance', icon: 'user', colorVar: '--nav-pos' },
      { to: '/employee-payments', label: 'Employee Payments', icon: 'card', colorVar: '--nav-pos' },
      { to: '/employee-incentive-rules', label: 'Incentive Rules', icon: 'incentive', colorVar: '--nav-pos' },
      { to: '/employee-ledger', label: 'Employee Ledger', icon: 'ledger', colorVar: '--nav-pos' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/accounts', label: 'Accounts', icon: 'bank', colorVar: '--nav-cash' },
      { to: '/fund-transfers', label: 'Fund Transfers', icon: 'transfer', colorVar: '--nav-cash' },
      { to: '/account-ledger', label: 'Account Ledger', icon: 'ledger', colorVar: '--nav-cash' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: '/financials', label: 'Financial Statements', icon: 'reports', colorVar: '--nav-reports' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/backup', label: 'Backups', icon: 'backup', colorVar: '--nav-system' },
    ],
  },
];

const COLLAPSE_KEY = 'hassan-sidebar-collapsed-sections';
const RAIL_KEY = 'hassan-sidebar-rail';

function readCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed != null ? parsed : {};
  } catch {
    return {};
  }
}

function readRail() {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [rail, setRail] = useState(readRail);
  const location = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, rail ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [rail]);

  // Auto-close the mobile drawer on route change.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // Persist collapsed-sections map.
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch {
      /* localStorage may be unavailable in private windows */
    }
  }, [collapsed]);

  const toggleSection = (label) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div
      className="app"
      data-nav={navOpen ? 'open' : 'closed'}
      data-rail={rail ? 'on' : 'off'}
    >
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden />

      <aside className="sidebar">
        <Brand rail={rail} onToggleRail={() => setRail((r) => !r)} />

        {/* Scrollable nav region — brand stays pinned at top, profile chip
            pinned at bottom; everything in between can scroll on short
            viewports without the whole sidebar disappearing. */}
        <div className="nav-scroll">
          {sections.map((s, i) => {
            const isCollapsed = s.label ? !!collapsed[s.label] : false;
            // Respect the user's explicit toggle. We do NOT auto-expand
            // when the active route is inside a collapsed section — that
            // broke the toggle (clicking collapse on the section
            // containing the current page appeared to do nothing).
            const shown = !s.label || !isCollapsed;
            return (
              <div className="nav-section" key={s.label ?? `_${i}`}>
                {s.label && (
                  <button
                    type="button"
                    className="nav-section-toggle"
                    onClick={() => toggleSection(s.label)}
                    aria-expanded={shown}
                    title={shown ? 'Collapse' : 'Expand'}
                  >
                    <Icon
                      name="chevron"
                      size={13}
                      style={{
                        transform: shown ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}
                    />
                    <span>{s.label}</span>
                  </button>
                )}
                {shown &&
                  s.items.map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      className={({ isActive }) =>
                        'nav-item' + (isActive ? ' active' : '')
                      }
                      style={{ '--nav-c': `var(${n.colorVar})` }}
                      title={n.label}
                    >
                      <div className="nav-icon">
                        <Icon name={n.icon} size={15} />
                      </div>
                      <span>{n.label}</span>
                    </NavLink>
                  ))}
              </div>
            );
          })}
        </div>

      </aside>

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" size={18} />
          </button>

          <div className="search">
            <Icon name="search" size={15} />
            <input
              className="input"
              placeholder="Search items, customers, vouchers…"
            />
          </div>

          <div className="spacer" />
          <ThemeToggle />
        </header>

        <BackupReminder />

        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/**
 * Cross-page banner that polls /backup/status every 5 minutes (and on
 * route change) and surfaces a one-click prompt when the day's backup is
 * overdue. Dismissed for the current browser session.
 */
function BackupReminder() {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('backup-reminder-dismissed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .get('/backup/status')
        .then((r) => {
          if (!cancelled) setStatus(r.data);
        })
        .catch(() => {
          /* backend may not be reachable yet — ignore silently */
        });
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status?.overdue || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('backup-reminder-dismissed', '1');
    } catch {
      /* ignore quota errors */
    }
  };

  return (
    <div
      style={{
        padding: '12px 18px',
        margin: '12px 18px 0',
        borderRadius: 'var(--radius)',
        background:
          'linear-gradient(135deg, rgba(244,63,94,0.15), rgba(124,58,237,0.10))',
        border: '1px solid rgba(244,63,94,0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1 }}>
        ⚠ Today's backup is overdue — scheduled for{' '}
        <strong>{String(status.scheduledHour).padStart(2, '0')}:00</strong>.{' '}
        <Link to="/backup" style={{ textDecoration: 'underline', color: 'var(--violet-400)' }}>
          Take it now →
        </Link>
      </span>
      <button className="btn btn-sm btn-ghost" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}
