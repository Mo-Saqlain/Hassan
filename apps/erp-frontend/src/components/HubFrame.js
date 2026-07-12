import { NavLink, Outlet } from 'react-router-dom';
import Icon from './Icon';
import { isSuperuser, useAuth } from '../auth/AuthContext';

/**
 * Layout route used by domain hubs (Customer, Supplier, Sales, …). Renders
 * the hub's title (and optional subtitle) above a horizontal strip of tabs
 * for its sub-pages, with the matching route's content via `<Outlet />`
 * below. Replaces the old collapsible sidebar groups.
 *
 * Tab `to` is matched with NavLink's default partial-prefix logic, so
 * `/customer-ledger` stays highlighted on `/customer-ledger/:id`.
 *
 * Tabs flagged `superuserOnly` are hidden from regular users (e.g. the
 * Audit/Errors tabs under System). The backend also enforces this — the
 * filter here is purely a UX hint.
 */
export default function HubFrame({ title, subtitle, tabs }) {
  const { user } = useAuth();
  const visible = tabs.filter(
    (t) => !t.superuserOnly || isSuperuser(user),
  );
  return (
    <>
      <header className="hub-head">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <nav className="hub-tabs" aria-label="Section tabs">
        {visible.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              'hub-tab' + (isActive ? ' active' : '')
            }
            style={t.colorVar ? { '--hub-c': `var(${t.colorVar})` } : undefined}
          >
            {t.icon && <Icon name={t.icon} size={14} />}
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="hub-body">
        <Outlet />
      </div>
    </>
  );
}
