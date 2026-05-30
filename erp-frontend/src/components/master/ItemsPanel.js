import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';
import { useUnsavedChangesPrompt } from '../../hooks/useUnsavedChangesPrompt';
import ExportButtons from '../ExportButtons';

const empty = {
  modelNo: '',
  sku: '',
  brandId: '',
  categoryIds: [],
  purchasePrice: '',
  salePrice: '',
  unit: 'pcs',
  minStockLevel: '',
  isActive: true,
  // Three-mode tracking defaults match the most common case (appliances):
  // serialised with required serial entry and a manufacturer warranty.
  tracksSerials: true,
  serialRequiredOnSale: true,
  hasWarranty: true,
  warrantyType: 'COMPANY',
  warrantyDays: '365',
  isInternalGenerated: false,
};

export default function ItemsPanel() {
  const { data: items, loading, error, reload } = useResource('/items');
  const { data: brands } = useResource('/brands');
  const { data: categories } = useResource('/categories');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [initialForm, setInitialForm] = useState(empty);
  const [submitError, setSubmitError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isDirty = useMemo(
    () => showForm && JSON.stringify(form) !== JSON.stringify(initialForm),
    [showForm, form, initialForm],
  );
  useUnsavedChangesPrompt(isDirty);

  // Quick search — typing here filters the list as you go.
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      [it.modelNo, it.name, it.sku, it.brand?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [items, query]);

  const categoryPaths = useMemo(() => buildCategoryPaths(categories), [categories]);

  const open = (row) => {
    setEditing(row);
    const next = row
      ? {
          modelNo: row.modelNo ?? row.name ?? '',
          sku: row.sku ?? '',
          brandId: row.brandId ?? '',
          categoryIds: (row.categories ?? []).map((c) => c.id),
          purchasePrice: row.purchasePrice ?? '',
          salePrice: row.salePrice ?? '',
          unit: row.unit ?? 'pcs',
          minStockLevel: row.minStockLevel ?? '',
          isActive: row.isActive ?? true,
          tracksSerials: row.tracksSerials ?? true,
          serialRequiredOnSale: row.serialRequiredOnSale ?? true,
          hasWarranty: row.hasWarranty ?? true,
          warrantyType: row.warrantyType ?? 'COMPANY',
          warrantyDays:
            row.warrantyDays == null ? '' : String(row.warrantyDays),
          isInternalGenerated: row.isInternalGenerated ?? false,
        }
      : empty;
    setForm(next);
    setInitialForm(next);
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
    // Bulk accessories ("Stand Large", "Cable 3m", "Local Speaker 12\"") may
    // not have a model number at all — only the display name is required.
    // The backend auto-generates the SKU when one isn't supplied.
    const modelNo = form.modelNo.trim();
    const displayName = modelNo || form.sku.trim();
    if (!displayName) {
      setSubmitError('Either Model No. or SKU is required.');
      return;
    }
    const payload = {
      modelNo: modelNo || undefined,
      // Keep `name` in lockstep with whatever the user typed. When modelNo
      // is blank the display falls back to the user-supplied SKU.
      name: displayName,
      sku: form.sku.trim() || undefined,
      brandId: form.brandId || undefined,
      categoryIds: form.categoryIds,
      purchasePrice: form.purchasePrice === '' ? undefined : Number(form.purchasePrice),
      salePrice: form.salePrice === '' ? undefined : Number(form.salePrice),
      unit: form.unit || undefined,
      minStockLevel:
        form.minStockLevel === '' ? undefined : Number(form.minStockLevel),
      isActive: form.isActive,
      tracksSerials: form.tracksSerials,
      serialRequiredOnSale: form.tracksSerials
        ? form.serialRequiredOnSale
        : false,
      hasWarranty: form.hasWarranty,
      warrantyType: form.hasWarranty ? form.warrantyType : 'NONE',
      warrantyDays:
        form.hasWarranty && form.warrantyDays !== ''
          ? Number(form.warrantyDays)
          : undefined,
      // Local auto-serial only makes sense for tracksSerials items with no
      // brand attached — the spec ties this to unbranded local goods.
      isInternalGenerated:
        form.tracksSerials && !form.brandId
          ? form.isInternalGenerated
          : false,
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
        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <ExportButtons
            filename="items"
            title="Items"
            columns={[
              { key: 'modelNo', label: 'Model No.' },
              { key: 'brand', label: 'Brand', value: (r) => r.brand?.name ?? '' },
              {
                key: 'categories',
                label: 'Categories',
                value: (r) => (r.categories ?? []).map((c) => c.name).join('; '),
              },
              { key: 'purchasePrice', label: 'Purchase', align: 'right' },
              { key: 'salePrice', label: 'Sale', align: 'right' },
              { key: 'unit', label: 'Unit' },
              { key: 'minStockLevel', label: 'Min', align: 'right' },
              { key: 'isActive', label: 'Active' },
            ]}
            rows={filtered}
          />
          <button className="btn btn-primary" onClick={() => open(null)}>
            + Add Item
          </button>
        </div>
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
              <label>Model No.</label>
              <input
                autoFocus
                value={form.modelNo}
                placeholder="e.g. DAWLANCE LVS-15 (optional for accessories)"
                onChange={(e) => setForm({ ...form, modelNo: e.target.value })}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Optional. Appliances use the manufacturer model number; bulk
                accessories ("Stand Large", "Cable 3m") can leave it blank —
                the auto-generated SKU is enough.
              </div>
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

          <fieldset
            style={{
              marginTop: 12,
              border: '1px solid var(--border)',
              padding: '10px 12px',
            }}
          >
            <legend style={{ fontSize: 12, padding: '0 6px' }}>
              Tracking & warranty
            </legend>
            <div className="form-row">
              <div>
                <label title="Off for bulk accessories (stands, cables, remotes). On for appliances and gray-market items where you want to capture the manufacturer serial.">
                  Track serials per unit
                </label>
                <input
                  type="checkbox"
                  checked={form.tracksSerials}
                  onChange={(e) =>
                    setForm({ ...form, tracksSerials: e.target.checked })
                  }
                />
              </div>
              {form.tracksSerials && (
                <div>
                  <label title="When on, the POS blocks checkout until one serial per unit is scanned. Turn off for gray-market items whose serials may not be reliable.">
                    Serial required at sale
                  </label>
                  <input
                    type="checkbox"
                    checked={form.serialRequiredOnSale}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        serialRequiredOnSale: e.target.checked,
                      })
                    }
                  />
                </div>
              )}
              {form.tracksSerials && !form.brandId && (
                <div>
                  <label title="Generate LOCAL-{category-code}-{year}-{seq} serials at POS for unbranded items. Requires the item's category to have a Code set.">
                    Auto-generate local serials
                  </label>
                  <input
                    type="checkbox"
                    checked={form.isInternalGenerated}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        isInternalGenerated: e.target.checked,
                      })
                    }
                  />
                </div>
              )}
              <div>
                <label title="Master warranty switch. Off prints 'NO WARRANTY COVERAGE / SOLD AS-IS' on the receipt under this line.">
                  Offer a warranty
                </label>
                <input
                  type="checkbox"
                  checked={form.hasWarranty}
                  onChange={(e) =>
                    setForm({ ...form, hasWarranty: e.target.checked })
                  }
                />
              </div>
              {form.hasWarranty && (
                <>
                  <div>
                    <label title="COMPANY = manufacturer-backed. SHOP = shop-issued cover. CHECKING_ONLY = bench-tested at sale, no real cover. NONE = no warranty (still prints a line on the receipt).">
                      Warranty type
                    </label>
                    <select
                      value={form.warrantyType}
                      onChange={(e) =>
                        setForm({ ...form, warrantyType: e.target.value })
                      }
                    >
                      <option value="COMPANY">Company (manufacturer)</option>
                      <option value="SHOP">Shop (issued by us)</option>
                      <option value="CHECKING_ONLY">
                        Checking only (bench-tested)
                      </option>
                      <option value="NONE">None (no cover)</option>
                    </select>
                  </div>
                  {(form.warrantyType === 'COMPANY' ||
                    form.warrantyType === 'SHOP') && (
                    <div>
                      <label title="Warranty length in days. 365 = 1 year, 30 = one month. Copied onto every sold unit at checkout.">
                        Warranty (days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.warrantyDays}
                        onChange={(e) =>
                          setForm({ ...form, warrantyDays: e.target.value })
                        }
                        placeholder="365"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </fieldset>

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
        <table className="t">
          <thead>
            <tr>
              <th>Model No.</th>
              <th>Brand</th>
              <th>Categories</th>
              <th className="num">Purchase</th>
              <th className="num">Sale</th>
              <th>Unit</th>
              <th className="num">Min</th>
              <th>Status</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} style={!it.isActive ? { opacity: 0.55 } : undefined}>
                <td>
                  <strong style={{ color: 'var(--text)' }}>
                    {it.modelNo ?? it.name}
                  </strong>
                </td>
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
                <td className="num">{Number(it.purchasePrice).toFixed(2)}</td>
                <td className="num">{Number(it.salePrice).toFixed(2)}</td>
                <td>{it.unit}</td>
                <td className="num">{it.minStockLevel}</td>
                <td>
                  <span
                    className={`chip ${it.isActive ? 'chip-success' : ''}`}
                  >
                    {it.isActive ? 'Active' : 'Closed'}
                  </span>
                </td>
                <td className="num">
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
