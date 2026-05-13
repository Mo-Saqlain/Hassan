import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Brand from './Brand';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import GlobalSearch from './GlobalSearch';
import { api } from '../api/client';
import { SIDEBAR } from '../nav/hubs';

const RAIL_KEY = 'hassan-sidebar-rail';

function readRail() {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
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
          {SIDEBAR.map((n) => {
            // A hub entry stays highlighted when any of its sub-routes is
            // active; NavLink's default match is too narrow for that.
            const hubMatch =
              n.paths &&
              n.paths.some(
                (p) =>
                  location.pathname === p ||
                  location.pathname.startsWith(p + '/'),
              );
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  'nav-item' + (isActive || hubMatch ? ' active' : '')
                }
                style={{ '--nav-c': `var(${n.colorVar})` }}
                title={n.label}
              >
                <div className="nav-icon">
                  <Icon name={n.icon} size={15} />
                </div>
                <span>{n.label}</span>
              </NavLink>
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

          <GlobalSearch />

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
