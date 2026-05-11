import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';

const empty = { name: '', description: '', parentId: '', isActive: true };

export default function CategoriesPanel() {
  const { data: categories, loading, error, reload } = useResource('/categories');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [submitError, setSubmitError] = useState(null);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const open = (row) => {
    setEditing(row);
    setForm(
      row
        ? {
            name: row.name ?? '',
            description: row.description ?? '',
            parentId: row.parentId ?? '',
            isActive: row.isActive ?? true,
          }
        : empty,
    );
    setShowForm(true);
    setSubmitError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      parentId: form.parentId || undefined,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await api.patch(`/categories/${editing.id}`, payload);
      } else {
        await api.post('/categories', payload);
      }
      setShowForm(false);
      reload();
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"? Sub-categories will be re-parented to root.`)) return;
    try {
      await api.delete(`/categories/${row.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  const parentOptions = editing
    ? flat.filter((n) => n.id !== editing.id && !n.ancestors.includes(editing.id))
    : flat;

  return (
    <>
      <div className="panel-header">
        <h3>Categories</h3>
        <button className="btn btn-primary" onClick={() => open(null)}>
          + Add Category
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h4 style={{ marginTop: 0 }}>
            {editing ? 'Edit Category' : 'New Category'}
          </h4>
          {submitError && <div className="alert alert-error">{submitError}</div>}
          <div className="form-row">
            <div>
              <label>Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label>Parent Category</label>
              <select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              >
                <option value="">— Top Level —</option>
                {parentOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {'  '.repeat(n.depth)}
                    {n.depth > 0 ? '› ' : ''}
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Active</label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
            </div>
          </div>
          <div>
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Update' : 'Create'}
            </button>{' '}
            <button type="button" className="btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : tree.length === 0 ? (
        <div className="card muted center">No categories yet.</div>
      ) : (
        <div className="card">
          <CategoryTree nodes={tree} onEdit={open} onDelete={remove} />
        </div>
      )}
    </>
  );
}

function CategoryTree({ nodes, onEdit, onDelete, depth = 0 }) {
  return (
    <ul className="category-tree">
      {nodes.map((n) => (
        <li key={n.id}>
          <div className="category-row" style={{ paddingLeft: depth * 18 }}>
            <span>
              {depth > 0 && <span className="muted">› </span>}
              <strong>{n.name}</strong>
              {n.description && (
                <span className="muted"> — {n.description}</span>
              )}
              {!n.isActive && (
                <span className="badge badge-gray" style={{ marginLeft: 6 }}>
                  inactive
                </span>
              )}
            </span>
            <span>
              <button className="btn btn-sm" onClick={() => onEdit(n)}>
                Edit
              </button>{' '}
              <button
                className="btn btn-sm btn-danger"
                onClick={() => onDelete(n)}
              >
                Delete
              </button>
            </span>
          </div>
          {n.children?.length > 0 && (
            <CategoryTree
              nodes={n.children}
              onEdit={onEdit}
              onDelete={onDelete}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function buildTree(list) {
  const map = new Map();
  list.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots = [];
  for (const c of map.values()) {
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId).children.push(c);
    } else {
      roots.push(c);
    }
  }
  const sortRec = (arr) => {
    arr.sort((a, b) => a.name.localeCompare(b.name));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function flattenTree(roots) {
  const out = [];
  function walk(nodes, depth, ancestors) {
    for (const n of nodes) {
      out.push({ ...n, depth, ancestors });
      if (n.children?.length) {
        walk(n.children, depth + 1, [...ancestors, n.id]);
      }
    }
  }
  walk(roots, 0, []);
  return out;
}
