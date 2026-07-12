import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useUnsavedChangesPrompt } from '../../hooks/useUnsavedChangesPrompt';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function UsersInfo() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/users');
      setRows(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = async (row) => {
    if (!window.confirm(`Delete user "${row.username}"?`)) return;
    try {
      await api.delete(`/users/${row.id}`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    }
  };

  const toggleActive = async (row) => {
    try {
      await api.patch(`/users/${row.id}`, { isActive: !row.isActive });
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Update failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Users</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Add user
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Full name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th>Created</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.username}</strong>
                  {u.id === me?.id && <span className="muted"> (you)</span>}
                </td>
                <td>{u.fullName ?? '—'}</td>
                <td>
                  <span
                    className={`badge ${u.role === 'SUPERUSER' ? 'badge-green' : 'badge-gray'}`}
                  >
                    {u.role}
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}
                  >
                    {u.isActive ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>{fmt(u.lastLoginAt)}</td>
                <td>{fmt(u.createdAt)}</td>
                <td className="right">
                  <button
                    className="btn btn-sm"
                    onClick={() => toggleActive(u)}
                    disabled={u.id === me?.id}
                  >
                    {u.isActive ? 'Disable' : 'Enable'}
                  </button>{' '}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => remove(u)}
                    disabled={u.id === me?.id}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'USER',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isDirty =
    form.username !== '' ||
    form.password !== '' ||
    form.fullName !== '' ||
    form.role !== 'USER';
  useUnsavedChangesPrompt(isDirty);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/users', {
        username: form.username.trim(),
        password: form.password,
        fullName: form.fullName.trim() || undefined,
        role: form.role,
      });
      onCreated();
    } catch (err) {
      setError(err.uiMessage ?? 'Could not create user');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Create user</h3>
        <form onSubmit={submit}>
          <label>Username *</label>
          <input
            autoFocus
            value={form.username}
            onChange={set('username')}
            required
            minLength={2}
          />
          <label>Password *</label>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={6}
          />
          <label>Full name</label>
          <input value={form.fullName} onChange={set('fullName')} />
          <label>Role</label>
          <select value={form.role} onChange={set('role')}>
            <option value="USER">USER (regular)</option>
            <option value="SUPERUSER">SUPERUSER (admin)</option>
          </select>
          {error && (
            <div className="alert alert-error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Create user'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
