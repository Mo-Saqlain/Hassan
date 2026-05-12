import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';

const empty = {
  modelNo: '',
  barcode: '',
  sku: '',
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Quick search — typing here filters the list as you go.
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      [it.modelNo, it.name, it.sku, it.barcode, it.brand?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [items, query]);

  const categoryPaths = useMemo(() => buildCategoryPaths(categories), [categories]);

  const open = (row) => {
    setEditing(row);
    setForm(
      row
        ? {
            modelNo: row.modelNo ?? row.name ?? '',
            barcode: row.barcode ?? '',
            sku: row.sku ?? '',
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
    setShowAdvanced(false);
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
    const modelNo = form.modelNo.trim();
    if (!modelNo) {
      setSubmitError('Model No. is required');
      return;
    }
    const payload = {
      modelNo,
      // name auto-derives from modelNo on the backend; send it explicitly so
      // the displayed name updates in lockstep when the user edits modelNo.
      name: modelNo,
      barcode: form.barcode.trim() || undefined,
      sku: form.sku.trim() || undefined,
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
    if (!window.confirm(`Delete "${row.modelNo ?? row.name}"?`)) return;
    try {
      await api.delete(`/items/${row.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  const toggleActive = async (row) => {
    try {
      await api.patch(`/items/${row.id}`, { isActive: !row.isActive });
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Update failed');
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

      <div className="card" style={{ marginBottom: 12 }}>
        <label>Quick search</label>
        <input
          autoFocus={!showForm}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a model no., name, SKU, barcode, or brand…"
          list="items-quick-search-list"
        />
        <datalist id="items-quick-search-list">
          {items.map((it) => (
            <option
              key={it.id}
              value={it.modelNo ?? it.name}
              label={`${it.brand?.name ?? '—'} · Buy ${Number(it.purchasePrice).toFixed(0)} · Sell ${Number(it.salePrice).toFixed(0)}`}
            />
          ))}
        </datalist>
        {query.trim() && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </div>
        )}
      </div>

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h4 style={{ marginTop: 0 }}>{editing ? 'Edit Item' : 'New Item'}</h4>
          {submitError && <div className="alert alert-error">{submitError}</div>}
          <div className="form-row">
            <div>
              <label>Model No. *</label>
              <input
                required
                autoFocus
                value={form.modelNo}
                placeholder="e.g. RT34K3753S8"
                onChange={(e) => setForm({ ...form, modelNo: e.target.value })}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                The model number is used as this item's name. SKU is
                auto-generated from it.
              </div>
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

          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? '− Hide advanced' : '+ Advanced (override SKU)'}
            </button>
          </div>

          {showAdvanced && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <div>
                <label>SKU (override)</label>
                <input
                  value={form.sku}
                  placeholder="Auto-derived from Model No. when blank"
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Stock Keeping Unit — internal unique code. Leave blank to let
                  the system match it to your Model No.
                </div>
              </div>
            </div>
          )}

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
      ) : filtered.length === 0 ? (
        <div className="card muted center">
          {query.trim() ? 'No items match your search.' : 'No items yet.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Model No. / Name</th>
              <th>Brand</th>
              <th>Barcode</th>
              <th>Categories</th>
              <th className="right">Purchase</th>
              <th className="right">Sale</th>
              <th>Unit</th>
              <th className="right">Min</th>
              <th>Status</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} style={!it.isActive ? { opacity: 0.55 } : undefined}>
                <td>
                  <strong>{it.modelNo ?? it.name}</strong>
                  {it.sku && it.sku !== (it.modelNo ?? it.name) && (
                    <div className="muted" style={{ fontSize: 11 }}>
                      SKU: {it.sku}
                    </div>
                  )}
                </td>
                <td>{it.brand?.name ?? '—'}</td>
                <td>{it.barcode ?? '—'}</td>
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
                <td>
                  <span
                    className={`badge ${it.isActive ? 'badge-green' : 'badge-gray'}`}
                  >
                    {it.isActive ? 'Active' : 'Closed'}
                  </span>
                </td>
                <td className="right">
                  <button className="btn btn-sm" onClick={() => open(it)}>
                    Edit
                  </button>{' '}
                  <button className="btn btn-sm" onClick={() => toggleActive(it)}>
                    {it.isActive ? 'Close' : 'Reopen'}
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
