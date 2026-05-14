import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import Brand from './Brand';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import GlobalSearch from './GlobalSearch';
import { api } from '../api/client';
import { SIDEBAR } from '../nav/hubs';
import { isSuperuser, useAuth } from '../auth/AuthContext';

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
  const { user, loading } = useAuth();

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

  if (loading) {
    return <div className="login-shell"><div className="muted">Loading…</div></div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

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
          <LoginBell />
          <UserChip />
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
        padding: '10px 14px',
        margin: '10px 16px 0',
        borderRadius: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--danger)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1 }}>
        ⚠ Today's backup is overdue — scheduled for{' '}
        <strong>{String(status.scheduledHour).padStart(2, '0')}:00</strong>.{' '}
        <Link to="/backup" style={{ textDecoration: 'underline', color: 'var(--primary)' }}>
          Take it now
        </Link>
      </span>
      <button className="btn btn-sm btn-ghost" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}

/**
 * Superuser-only "bell" in the topbar — polls for unseen login events
 * and pending access requests every 30s, and shows a panel listing the
 * latest entries when clicked. Marks events as seen when the panel is
 * opened.
 */
function LoginBell() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ logins: 0, requests: 0 });
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState({ logins: [], requests: [] });
  const ref = useRef(null);

  useEffect(() => {
    if (!isSuperuser(user)) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const [l, r] = await Promise.all([
          api.get('/users/login-events/unseen-count'),
          api.get('/users/access-requests/pending-count'),
        ]);
        if (!cancelled) {
          setCounts({ logins: l.data.count, requests: r.data.count });
        }
      } catch {
        /* ignore — likely just logged out */
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [open]);

  if (!isSuperuser(user)) return null;

  const total = counts.logins + counts.requests;

  const togglePanel = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      try {
        const [l, r] = await Promise.all([
          api.get('/users/login-events?unseen=true&limit=20'),
          api.get('/users/access-requests?status=PENDING'),
        ]);
        setItems({ logins: l.data, requests: r.data });
        // Optimistically mark logins seen.
        await api.post('/users/login-events/mark-seen').catch(() => {});
        setCounts((c) => ({ ...c, logins: 0 }));
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={togglePanel}
        title="Login notifications"
        style={{ position: 'relative' }}
      >
        🔔
        {total > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              background: 'var(--danger)',
              color: '#fff',
              borderRadius: 0,
              fontSize: 10,
              padding: '1px 5px',
              minWidth: 16,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            {total}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            width: 320,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--surface-elev)',
            color: 'var(--text)',
            border: '1px solid var(--border-strong)',
            borderRadius: 0,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
            padding: 10,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Pending access requests ({items.requests.length})
          </div>
          {items.requests.length === 0 ? (
            <div className="muted" style={{ marginBottom: 12 }}>None.</div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              {items.requests.slice(0, 5).map((r) => (
                <div key={r.id} style={{ padding: '4px 0' }}>
                  <strong>{r.requestedUsername}</strong>{' '}
                  <span className="muted">— {r.fullName}</span>
                </div>
              ))}
              <Link
                to="/users"
                onClick={() => setOpen(false)}
                style={{ fontSize: 12, color: 'var(--primary)' }}
              >
                Review in Users
              </Link>
            </div>
          )}

          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Recent logins
          </div>
          {items.logins.length === 0 ? (
            <div className="muted">No new logins.</div>
          ) : (
            items.logins.slice(0, 8).map((l) => (
              <div key={l.id} style={{ padding: '4px 0' }}>
                <strong>{l.username}</strong>{' '}
                <span className="muted" style={{ fontSize: 11 }}>
                  {new Date(l.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Signed-in user chip in the topbar — shows the username, role hint, and a
 * Logout button. The Logout button shows a confirmation modal first so an
 * accidental tap on a touch screen / sleeping POS terminal doesn't kick
 * the cashier out mid-sale.
 */
function UserChip() {
  const { user, logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  if (!user) return null;
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '3px 10px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 0,
          fontSize: 12,
        }}
      >
        <Icon name="user" size={14} />
        <span>
          <strong>{user.username}</strong>
          {isSuperuser(user) && (
            <span className="muted" style={{ marginLeft: 4 }}>· admin</span>
          )}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setConfirming(true)}
          style={{ padding: '2px 8px' }}
          title="Sign out"
        >
          Logout
        </button>
      </div>
      {confirming && (
        <LogoutConfirm
          username={user.username}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            setConfirming(false);
            await logout();
          }}
        />
      )}
    </>
  );
}

function LogoutConfirm({ username, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(380px, 92vw)' }}
      >
        <h3 style={{ marginTop: 0 }}>Sign out?</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          You're about to sign <strong>{username}</strong> out of Hassan
          Electronics ERP. Any unsaved work on the current page will be lost.
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            autoFocus
          >
            Stay signed in
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
