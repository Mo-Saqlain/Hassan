import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';

const empty = {
  name: '',
  sku: '',
  barcode: '',
  brandId: '',
  categoryIds: [],
  purchasePrice: '',
  salePrice: '',
  unit: 'pcs',
  minStockLevel: '',
  isActive: true,
};

export default function ItemsPanel() {
  const { data: items, loading, error, reload } = useResource('/items');
  const { data: brands } = useResource('/brands');
  const { data: categories } = useResource('/categories');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [submitError, setSubmitError] = useState(null);

  const categoryPaths = useMemo(() => buildCategoryPaths(categories), [categories]);

  const open = (row) => {
    setEditing(row);
    setForm(
      row
        ? {
            name: row.name ?? '',
            sku: row.sku ?? '',
            barcode: row.barcode ?? '',
            brandId: row.brandId ?? '',
            categoryIds: (row.categories ?? []).map((c) => c.id),
            purchasePrice: row.purchasePrice ?? '',
            salePrice: row.salePrice ?? '',
            unit: row.unit ?? 'pcs',
            minStockLevel: row.minStockLevel ?? '',
            isActive: row.isActive ?? true,
          }
        : empty,
    );
    setShowForm(true);
    setSubmitError(null);
  };

  const toggleCategory = (id) => {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((c) => c !== id)
        : [...f.categoryIds, id],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || undefined,
      brandId: form.brandId || undefined,
      categoryIds: form.categoryIds,
      purchasePrice: form.purchasePrice === '' ? undefined : Number(form.purchasePrice),
      salePrice: form.salePrice === '' ? undefined : Number(form.salePrice),
      unit: form.unit || undefined,
      minStockLevel:
        form.minStockLevel === '' ? undefined : Number(form.minStockLevel),
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await api.patch(`/items/${editing.id}`, payload);
      } else {
        await api.post('/items', payload);
      }
      setShowForm(false);
      reload();
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    try {
      await api.delete(`/items/${row.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  return (
    <>
      <div className="panel-header">
        <h3>Items</h3>
        <button className="btn btn-primary" onClick={() => open(null)}>
          + Add Item
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h4 style={{ marginTop: 0 }}>{editing ? 'Edit Item' : 'New Item'}</h4>
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
              <label>SKU *</label>
              <input
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
            <div>
              <label>Barcode</label>
              <input
                value={form.barcode}
                placeholder="optional, scannable"
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div>
              <label>Brand</label>
              <select
                value={form.brandId}
                onChange={(e) => setForm({ ...form, brandId: e.target.value })}
              >
                <option value="">— None —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Purchase Price</label>
              <input
                type="number"
                step="any"
                value={form.purchasePrice}
                onChange={(e) =>
                  setForm({ ...form, purchasePrice: e.target.value })
                }
              />
            </div>
            <div>
              <label>Sale Price</label>
              <input
                type="number"
                step="any"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
              />
            </div>
            <div>
              <label>Unit</label>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
            <div>
              <label>Min Stock Level</label>
              <input
                type="number"
                value={form.minStockLevel}
                onChange={(e) =>
                  setForm({ ...form, minStockLevel: e.target.value })
                }
              />
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
            <label>Categories (select any number)</label>
            {categories.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                No categories yet. Add some in the Categories tile first.
              </div>
            ) : (
              <div className="chip-picker">
                {categoryPaths.map(({ id, path }) => (
                  <label
                    key={id}
                    className={`chip ${form.categoryIds.includes(id) ? 'chip-on' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(id)}
                      onChange={() => toggleCategory(id)}
                    />
                    {path}
                  </label>
                ))}
              </div>
            )}
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
      ) : items.length === 0 ? (
        <div className="card muted center">No items yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Barcode</th>
              <th>Brand</th>
              <th>Categories</th>
              <th className="right">Purchase</th>
              <th className="right">Sale</th>
              <th>Unit</th>
              <th className="right">Min</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.name}</td>
                <td>{it.sku}</td>
                <td>{it.barcode ?? '—'}</td>
                <td>{it.brand?.name ?? '—'}</td>
                <td>
                  {(it.categories ?? []).length === 0
                    ? '—'
                    : it.categories.map((c) => (
                        <span key={c.id} className="badge badge-gray" style={{ marginRight: 4 }}>
                          {c.name}
                        </span>
                      ))}
                </td>
                <td className="right">{Number(it.purchasePrice).toFixed(2)}</td>
                <td className="right">{Number(it.salePrice).toFixed(2)}</td>
                <td>{it.unit}</td>
                <td className="right">{it.minStockLevel}</td>
                <td className="right">
                  <button className="btn btn-sm" onClick={() => open(it)}>
                    Edit
                  </button>{' '}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => remove(it)}
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

function buildCategoryPaths(categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const memo = new Map();
  function pathOf(id) {
    if (memo.has(id)) return memo.get(id);
    const c = byId.get(id);
    if (!c) return '';
    const parent = c.parentId ? pathOf(c.parentId) : '';
    const out = parent ? `${parent} › ${c.name}` : c.name;
    memo.set(id, out);
    return out;
  }
  return categories
    .map((c) => ({ id: c.id, path: pathOf(c.id) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
