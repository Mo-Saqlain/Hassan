import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { isSuperuser, useAuth } from '../../auth/AuthContext';

export default function UsersChangePassword() {
  const { user, changePassword } = useAuth();
  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Change password</h2>
      </div>
      <SelfPasswordCard
        username={user?.username}
        onChange={changePassword}
      />
      {isSuperuser(user) && <AdminResetCard currentUserId={user?.id} />}
    </>
  );
}

function SelfPasswordCard({ username, onChange }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (next.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await onChange(cur, next);
      setMsg('Password changed. Please sign in again with the new password.');
    } catch (err) {
      setError(err.uiMessage ?? 'Could not change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        My password{username ? ` — ${username}` : ''}
      </h3>
      <form onSubmit={submit}>
        <div className="form-row">
          <div>
            <label>Current password</label>
            <input
              type="password"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label>New password</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {msg && <div className="alert alert-success">{msg}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}

function AdminResetCard({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const r = await api.get('/users');
      // Don't list the admin's own row here — they have the self-card above.
      setUsers(r.data.filter((u) => u.id !== currentUserId));
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load users');
    }
  }, [currentUserId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!userId) {
      setError('Pick a user.');
      return;
    }
    if (next.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/users/${userId}`, { password: next });
      const u = users.find((x) => x.id === userId);
      setMsg(
        `Password updated for "${u?.username ?? userId}". They'll be forced to sign in again.`,
      );
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err.uiMessage ?? 'Could not reset password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Reset another user's password</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        As an administrator you can set a new password for any other user.
        They'll be signed out everywhere and will need to use the new
        password on their next login.
      </p>
      <form onSubmit={submit}>
        <div className="form-row">
          <div>
            <label>User *</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            >
              <option value="">— pick a user —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} {u.fullName ? `(${u.fullName})` : ''}{' '}
                  {u.role === 'SUPERUSER' ? '· admin' : ''}
                  {!u.isActive ? ' · disabled' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>New password *</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label>Confirm new password *</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {msg && <div className="alert alert-success">{msg}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}
