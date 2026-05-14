import { Navigate, useLocation } from 'react-router-dom';
import { isSuperuser, useAuth } from './AuthContext';

/**
 * Route guard for pages that only the admin should see — Audit Log,
 * Error Log, and the admin tabs of the Users hub. Non-superusers are
 * bounced to a sensible page they CAN use: within the Users hub that's
 * `/users-change-password` (the one tab they can see); elsewhere it's
 * `/backup` (a System hub page they can also reach).
 */
export default function RequireSuperuser({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperuser(user)) {
    const fallback = location.pathname.startsWith('/users')
      ? '/users-change-password'
      : '/backup';
    return <Navigate to={fallback} replace />;
  }
  return children;
}
