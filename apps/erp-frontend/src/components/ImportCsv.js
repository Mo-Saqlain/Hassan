import { useRef, useState } from 'react';
import { api } from '../api/client';
import { parseCsv } from '../utils/csv';

/**
 * "Import CSV" button + dialog used in every master-data panel to bulk-load
 * records migrated from the shop's previous software.
 *
 * Flow: pick a .csv → it's parsed client-side into `{ column: value }` rows →
 * posted to `${schema.path}/import` → the backend maps each row onto the
 * entity's Create DTO, validates it, and creates it, isolating per-row
 * failures. The result (created count + failed rows with reasons) is shown so
 * the owner can fix the spreadsheet and re-upload.
 *
 * `schema` is one entry from utils/importSchemas.js. `onDone` reloads the list
 * after a successful import.
 */
export default function ImportCsv({ schema, onDone, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const unit = schema.unitLabel || 'row';

  const reset = () => {
    setRows(null);
    setFileName('');
    setParseError(null);
    setResult(null);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    reset();
  };

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setResult(null);
    setRows(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        setParseError('No data rows found — the file looks empty or header-only.');
        return;
      }
      setRows(parsed.rows);
    } catch {
      setParseError('Could not read that file. Make sure it is a plain .csv.');
    }
  };

  const doImport = async () => {
    if (!rows?.length) return;
    setBusy(true);
    setResult(null);
    setParseError(null);
    try {
      const r = await api.post(`${schema.path}/import`, { rows });
      setResult(r.data);
      if (r.data?.created > 0 && onDone) onDone();
    } catch (err) {
      setParseError(err.uiMessage ?? 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = schema.columns.map((c) => esc(c.key)).join(',');
    const example = schema.columns.map((c) => esc(c.example ?? '')).join(',');
    const csv = '﻿' + header + '\n' + example;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schema.label.toLowerCase().replace(/\s+/g, '_')}_template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        type="button"
        className={`btn btn-${size}`}
        onClick={() => setOpen(true)}
        title={`Import ${schema.label} from a CSV exported by your previous software`}
      >
        Import CSV
      </button>

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 600, width: '92vw' }}
          >
            <h3 style={{ marginTop: 0 }}>Import {schema.label} from CSV</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Pick a <code>.csv</code> with a header row matching the columns
              below.{' '}
              {schema.help ?? `Each row becomes one ${schema.label.replace(/s$/, '')}.`}{' '}
              Failures are reported individually — the rest still import.
            </p>

            <div style={{ marginBottom: 10 }}>
              <button type="button" className="btn btn-sm" onClick={downloadTemplate}>
                Download blank template
              </button>
            </div>

            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                Expected columns ({schema.columns.length})
              </summary>
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="t" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schema.columns.map((c) => (
                      <tr key={c.key}>
                        <td>
                          <code>{c.key}</code>
                          {c.required && (
                            <span className="badge badge-red" style={{ marginLeft: 6 }}>
                              required
                            </span>
                          )}
                        </td>
                        <td className="muted">{c.hint ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <label>CSV file</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onPick}
              disabled={busy}
            />
            {fileName && rows && !result && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                <strong>{fileName}</strong> — {rows.length} row
                {rows.length === 1 ? '' : 's'} ready to import.
              </div>
            )}

            {parseError && (
              <div className="alert alert-error" style={{ marginTop: 10 }}>
                {parseError}
              </div>
            )}

            {result && (
              <div style={{ marginTop: 12 }}>
                <div
                  className={`alert ${result.failed?.length ? 'alert-error' : ''}`}
                  style={
                    result.failed?.length
                      ? undefined
                      : { background: 'var(--success-bg, #ecfdf5)', color: 'var(--success, #047857)', padding: '8px 12px' }
                  }
                >
                  Imported <strong>{result.created}</strong> of {result.total}{' '}
                  {unit}
                  {result.total === 1 ? '' : 's'}.
                  {result.failed?.length > 0 && (
                    <> {result.failed.length} failed — see below.</>
                  )}
                </div>
                {result.failed?.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                    <table className="t" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>Line</th>
                          <th>Row</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.failed.map((f, i) => (
                          <tr key={i}>
                            <td>{f.row}</td>
                            <td>{f.label ?? '—'}</td>
                            <td className="muted">{f.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                marginTop: 16,
              }}
            >
              <button type="button" className="btn" disabled={busy} onClick={close}>
                {result ? 'Close' : 'Cancel'}
              </button>
              {!result && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !rows?.length}
                  onClick={doImport}
                >
                  {busy ? 'Importing…' : `Import ${rows?.length ?? 0} row${rows?.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
