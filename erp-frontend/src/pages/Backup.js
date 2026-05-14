import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiBaseUrl } from '../api/client';

const fmtSize = (b) => {
  const n = Number(b ?? 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function Backup() {
  const [status, setStatus] = useState(null);
  const [list, setList] = useState([]);
  const [hour, setHour] = useState('20');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [st, l] = await Promise.all([
        api.get('/backup/status'),
        api.get('/backup'),
      ]);
      setStatus(st.data);
      setList(l.data);
      setHour(String(st.data.scheduledHour));
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load backup status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const downloadNow = () => {
    // Pure download — bypass axios and let the browser's native download
    // handler write the file straight to disk.
    window.location.href = `${apiBaseUrl()}/backup/download-now`;
  };

  const triggerStored = async () => {
    setBusy('create');
    setError(null);
    try {
      await api.post('/backup', { notes: 'Manual backup from UI' });
      reload();
    } catch (e) {
      setError(e.uiMessage ?? 'Backup failed');
    } finally {
      setBusy(null);
    }
  };

  const downloadStored = (id) => {
    window.location.href = `${apiBaseUrl()}/backup/${id}/download`;
  };

  const removeStored = async (row) => {
    if (!window.confirm(`Delete backup ${row.fileName}? This removes the file from disk.`)) return;
    setBusy(row.id);
    try {
      await api.delete(`/backup/${row.id}`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  const saveSchedule = async () => {
    const n = parseInt(hour, 10);
    if (!Number.isInteger(n) || n < 0 || n > 23) {
      setError('Hour must be 0–23');
      return;
    }
    setBusy('schedule');
    setError(null);
    try {
      await api.post('/backup/schedule', { hour: n });
      reload();
    } catch (e) {
      setError(e.uiMessage ?? 'Could not save schedule');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Backups</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            onClick={downloadNow}
            title="Generate a snapshot and download without saving on the server"
          >
            ⬇ Download snapshot
          </button>
          <button
            className="btn btn-primary"
            disabled={busy === 'create'}
            onClick={triggerStored}
          >
            {busy === 'create' ? 'Backing up…' : '💾 Save backup now'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {status?.overdue && (
        <div className="alert alert-error">
          ⚠ Today's backup hasn't been taken yet. The scheduled time was{' '}
          <strong>{String(status.scheduledHour).padStart(2, '0')}:00</strong>.
          Click "Save backup now" to take one.
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Status</h3>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : !status ? null : (
          <div className="form-row" style={{ marginBottom: 0 }}>
            <div>
              <label>Last backup</label>
              <div>{status.latest ? fmtDate(status.latest.createdAt) : 'Never'}</div>
            </div>
            <div>
              <label>Today's backup</label>
              <div>
                <span
                  className={`badge ${status.hasTodayBackup ? 'badge-green' : 'badge-red'}`}
                >
                  {status.hasTodayBackup ? 'Done' : 'Pending'}
                </span>
              </div>
            </div>
            <div>
              <label>Saved on</label>
              <div className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {status.backupDir}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Schedule</h3>
        <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
          The system automatically takes one backup per day at the time you set
          below. If the shop is closed at that hour, opening the app later in the
          day will surface a reminder banner.
        </div>
        <div className="form-row" style={{ marginBottom: 0, alignItems: 'flex-start' }}>
          <div>
            <label>Daily backup hour (0–23)</label>
            <input
              type="number"
              min="0"
              max="23"
              value={hour}
              onChange={(e) => setHour(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              e.g. 20 = 8 PM (end of day for most retail shops)
            </div>
          </div>
          <div>
            {/* Invisible label keeps the button on the same horizontal row
                as the number input above (instead of being pushed down by
                the hint line below the input). */}
            <label aria-hidden style={{ visibility: 'hidden' }}>&nbsp;</label>
            <button
              className="btn btn-primary"
              disabled={busy === 'schedule'}
              onClick={saveSchedule}
            >
              {busy === 'schedule' ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </div>
      </div>

      <RestoreSection onRestored={reload} />

      <h3>History</h3>
      {loading ? (
        <div className="muted">Loading…</div>
      ) : list.length === 0 ? (
        <div className="card muted center">
          No backups taken yet. Click "Save backup now" to create the first one.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>File</th>
              <th>Source</th>
              <th className="right">Size</th>
              <th>Notes</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td>{fmtDate(b.createdAt)}</td>
                <td style={{ wordBreak: 'break-all' }}>{b.fileName}</td>
                <td>
                  <span
                    className={`badge ${b.trigger === 'AUTO' ? 'badge-gray' : 'badge-green'}`}
                  >
                    {b.trigger}
                  </span>
                </td>
                <td className="right">{fmtSize(b.sizeBytes)}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {b.notes ?? ''}
                </td>
                <td className="right">
                  <button
                    className="btn btn-sm"
                    onClick={() => downloadStored(b.id)}
                  >
                    Download
                  </button>{' '}
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={busy === b.id}
                    onClick={() => removeStored(b)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function RestoreSection({ onRestored }) {
  const fileInput = useRef(null);
  const [fileName, setFileName] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const pickFile = (e) => {
    setError(null);
    setResult(null);
    setSnapshot(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ''));
        if (!parsed?.data || typeof parsed.data !== 'object') {
          throw new Error('File is not a Hassan Electronics backup (missing "data").');
        }
        setSnapshot(parsed);
      } catch (err) {
        setError(err.message || 'Could not parse the backup file as JSON.');
      }
    };
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsText(file);
  };

  const run = async () => {
    if (!snapshot) {
      setError('Pick a backup file first.');
      return;
    }
    if (confirm !== 'RESTORE') {
      setError('Type RESTORE in the confirmation box to proceed.');
      return;
    }
    if (!password) {
      setError('Enter your account password to authorise the restore.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.post('/backup/restore', {
        confirm: 'RESTORE',
        snapshot,
        password,
      });
      setResult(r.data);
      setConfirm('');
      setPassword('');
      setSnapshot(null);
      setFileName('');
      if (fileInput.current) fileInput.current.value = '';
      onRestored?.();
    } catch (err) {
      setError(err.uiMessage ?? 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ border: '1px solid var(--danger)' }}>
      <h3 style={{ marginTop: 0, color: 'var(--danger-fg)' }}>
        🔥 Restore from backup
      </h3>
      <div className="alert alert-error" style={{ marginBottom: 12 }}>
        <strong>Destructive:</strong> restoring wipes every business table
        (sales, purchases, payments, items, customers, …) and replays the
        chosen snapshot. Before the wipe runs we automatically save a
        <strong> Pre-restore safety snapshot</strong> of your current DB
        as an AUTO backup, so you can roll back if needed. The Backups
        history itself is kept across restores.
      </div>

      <div className="form-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <label>Backup file (.json)</label>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={pickFile}
          />
          {fileName && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Loaded: {fileName}
              {snapshot?.generatedAt && (
                <>
                  {' '}· generated {new Date(snapshot.generatedAt).toLocaleString()}
                </>
              )}
              {snapshot?.data && (
                <>
                  {' '}· {Object.keys(snapshot.data).length} tables
                </>
              )}
            </div>
          )}
        </div>
        <div>
          <label>Type RESTORE to confirm</label>
          <input
            value={confirm}
            placeholder="RESTORE"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <div>
          <label>Your account password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
        <div>
          {/* Spacer label keeps the button on the same row as the inputs. */}
          <label aria-hidden style={{ visibility: 'hidden' }}>&nbsp;</label>
          <button
            className="btn btn-danger"
            disabled={busy || !snapshot || confirm !== 'RESTORE' || !password}
            onClick={run}
          >
            {busy ? 'Restoring…' : 'Restore now'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
      {result && (
        <div className="alert alert-success" style={{ marginTop: 10 }}>
          ✓ Restored {result.totalRows.toLocaleString()} rows across{' '}
          {Object.keys(result.tableCounts).length} tables at{' '}
          {new Date(result.completedAt).toLocaleString()}.
          {result.preRestoreBackup && (
            <div style={{ marginTop: 4, fontSize: 12 }}>
              Your previous state was saved as{' '}
              <strong>{result.preRestoreBackup.fileName}</strong> — use it
              from the History list below if you need to roll back.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
