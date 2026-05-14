import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function UsersAllowAccess() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [approving, setApproving] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/users/access-requests?status=${statusFilter}`);
      setRows(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  const reject = async (row) => {
    if (!window.confirm(`Reject request from "${row.fullName}"?`)) return;
    try {
      await api.post(`/users/access-requests/${row.id}/reject`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Reject failed');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete request from "${row.fullName}"? (history only)`)) return;
    try {
      await api.delete(`/users/access-requests/${row.id}`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Access requests</h2>
        <div>
          <label style={{ marginRight: 6 }}>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card muted center">
          No {statusFilter.toLowerCase()} requests.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Requested username</th>
              <th>Full name</th>
              <th>Contact</th>
              <th>Reason</th>
              <th>Status</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmt(r.createdAt)}</td>
                <td>
                  <strong>{r.requestedUsername}</strong>
                </td>
                <td>{r.fullName}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {r.phone && <div>{r.phone}</div>}
                  {r.email && <div>{r.email}</div>}
                  {!r.phone && !r.email && '—'}
                </td>
                <td className="muted" style={{ fontSize: 12, maxWidth: 240 }}>
                  {r.reason ?? '—'}
                </td>
                <td>
                  <span
                    className={`badge ${
                      r.status === 'PENDING'
                        ? 'badge-gray'
                        : r.status === 'APPROVED'
                          ? 'badge-green'
                          : 'badge-red'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="right">
                  {r.status === 'PENDING' ? (
                    <>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setApproving(r)}
                      >
                        Approve
                      </button>{' '}
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => reject(r)}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => remove(r)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {approving && (
        <ApproveModal
          request={approving}
          onClose={() => setApproving(null)}
          onApproved={() => {
            setApproving(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function ApproveModal({ request, onClose, onApproved }) {
  const [form, setForm] = useState({
    username: request.requestedUsername,
    password: '',
    fullName: request.fullName,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/users/access-requests/${request.id}/approve`, {
        username: form.username.trim(),
        password: form.password,
        fullName: form.fullName.trim() || undefined,
      });
      onApproved();
    } catch (err) {
      setError(err.uiMessage ?? 'Could not approve');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>
          Approve {request.fullName}'s access request
        </h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Assign a username + password. The new user will be created as a
          regular USER; you can promote them later from the Info tab.
        </p>
        <form onSubmit={submit}>
          <label>Username *</label>
          <input
            autoFocus
            value={form.username}
            onChange={set('username')}
            required
            minLength={2}
          />
          <label>Initial password *</label>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={6}
          />
          <label>Full name</label>
          <input value={form.fullName} onChange={set('fullName')} />
          {error && (
            <div className="alert alert-error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Approving…' : 'Approve & create user'}
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
