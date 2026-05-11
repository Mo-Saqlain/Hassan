import { useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

/**
 * Generic CRUD page. Columns declare display only;
 * formFields declare inputs for add/edit.
 *
 * field = {
 *   key, label, type ('text'|'number'|'email'|'checkbox'|'textarea'),
 *   required?, placeholder?, defaultValue?
 * }
 */
export default function CrudPage({ title, path, columns, formFields }) {
  const { data, loading, error, reload } = useResource(path);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const startAdd = () => {
    setEditing(null);
    setShowForm(true);
    setSubmitError(null);
  };

  const startEdit = (row) => {
    setEditing(row);
    setShowForm(true);
    setSubmitError(null);
  };

  const handleSubmit = async (values) => {
    setSubmitError(null);
    try {
      if (editing) {
        await api.patch(`${path}/${editing.id}`, values);
      } else {
        await api.post(path, values);
      }
      setShowForm(false);
      setEditing(null);
      reload();
    } catch (e) {
      setSubmitError(e.uiMessage ?? 'Save failed');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.name ?? row.id}"?`)) return;
    try {
      await api.delete(`${path}/${row.id}`);
      reload();
    } catch (e) {
      alert(e.uiMessage ?? 'Delete failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>{title}</h2>
        <button className="btn btn-primary" onClick={startAdd}>
          + Add {title.replace(/s$/, '')}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <CrudForm
          fields={formFields}
          initial={editing}
          onCancel={() => setShowForm(false)}
          onSubmit={handleSubmit}
          submitError={submitError}
        />
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : data.length === 0 ? (
        <div className="card muted center">No records yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align}>
                  {c.label}
                </th>
              ))}
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align}>
                    {c.render ? c.render(row) : formatCell(row[c.key])}
                  </td>
                ))}
                <td className="right">
                  <button
                    className="btn btn-sm"
                    onClick={() => startEdit(row)}
                  >
                    Edit
                  </button>{' '}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(row)}
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

function formatCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function CrudForm({ fields, initial, onCancel, onSubmit, submitError }) {
  const [values, setValues] = useState(() => {
    const init = {};
    for (const f of fields) {
      init[f.key] =
        initial?.[f.key] !== undefined && initial?.[f.key] !== null
          ? initial[f.key]
          : f.defaultValue ?? (f.type === 'checkbox' ? false : '');
    }
    return init;
  });

  const handleChange = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleaned = {};
    for (const f of fields) {
      let v = values[f.key];
      if (f.type === 'number') v = v === '' ? undefined : Number(v);
      if (f.type === 'checkbox') v = !!v;
      if (v === '' || v === undefined) {
        if (f.required) return; // browser validation will catch
        continue;
      }
      cleaned[f.key] = v;
    }
    onSubmit(cleaned);
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 style={{ marginTop: 0 }}>{initial ? 'Edit' : 'New'}</h3>
      {submitError && <div className="alert alert-error">{submitError}</div>}
      <div className="form-row">
        {fields.map((f) => (
          <div key={f.key}>
            <label>
              {f.label}
              {f.required ? ' *' : ''}
            </label>
            {f.type === 'textarea' ? (
              <textarea
                value={values[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => handleChange(f.key, e.target.value)}
              />
            ) : f.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={!!values[f.key]}
                onChange={(e) => handleChange(f.key, e.target.checked)}
              />
            ) : f.type === 'select' ? (
              <select
                value={values[f.key] ?? ''}
                required={f.required}
                onChange={(e) => handleChange(f.key, e.target.value)}
              >
                {!f.required && <option value="">— None —</option>}
                {(f.options ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type ?? 'text'}
                value={values[f.key] ?? ''}
                required={f.required}
                placeholder={f.placeholder}
                step={f.type === 'number' ? 'any' : undefined}
                onChange={(e) => handleChange(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <button type="submit" className="btn btn-primary">
        {initial ? 'Update' : 'Create'}
      </button>{' '}
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
