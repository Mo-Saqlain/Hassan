import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

export default function StockLedger() {
  const [filters, setFilters] = useState({
    itemId: '',
    categoryId: '',
    brandId: '',
    supplierId: '',
    from: '',
    to: '',
  });
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/items'),
      api.get('/categories'),
      api.get('/brands'),
      api.get('/suppliers'),
    ]).then(([i, c, b, s]) => {
      setItems(i.data);
      setCategories(c.data);
      setBrands(b.data);
      setSuppliers(s.data);
    });
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) q.append(k, v);
    });
    return q.toString();
  }, [filters]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/reports/stock-ledger?${query}`);
      setData(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <>
      <div className="page-header">
        <h2>Stock Ledger</h2>
      </div>

      <div className="card">
        <div className="form-row">
          <div>
            <label>Item</label>
            <select value={filters.itemId} onChange={(e) => update('itemId', e.target.value)}>
              <option value="">— Any —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.sku})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Category</label>
            <select
              value={filters.categoryId}
              onChange={(e) => update('categoryId', e.target.value)}
            >
              <option value="">— Any —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Brand</label>
            <select value={filters.brandId} onChange={(e) => update('brandId', e.target.value)}>
              <option value="">— Any —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Supplier</label>
            <select
              value={filters.supplierId}
              onChange={(e) => update('supplierId', e.target.value)}
            >
              <option value="">— Any —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => update('from', e.target.value)}
            />
          </div>
          <div>
            <label>To</label>
            <input type="date" value={filters.to} onChange={(e) => update('to', e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={loading}>
          {loading ? 'Loading…' : 'Apply Filters'}
        </button>{' '}
        <button
          className="btn"
          onClick={() => {
            setFilters({
              itemId: '',
              categoryId: '',
              brandId: '',
              supplierId: '',
              from: '',
              to: '',
            });
          }}
        >
          Reset
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {data && (
        <>
          <div className="ledger-summary">
            <Stat label="Total IN" value={data.totalIn} color="var(--success)" />
            <Stat label="Total OUT" value={data.totalOut} color="var(--danger)" />
            <Stat label="Net Change" value={data.netChange} />
            <Stat label="Movements" value={data.movements.length} />
          </div>

          {data.movements.length === 0 ? (
            <div className="card muted center">No movements for this filter.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>SKU</th>
                  <th>Store</th>
                  <th>Type</th>
                  <th className="right">Qty</th>
                  <th>Reference</th>
                  <th className="right">Running</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.date).toLocaleString()}</td>
                    <td>{m.itemName}</td>
                    <td>{m.sku}</td>
                    <td>{m.storeName ?? '—'}</td>
                    <td>
                      <span
                        className={`badge ${
                          m.type === 'IN' ? 'badge-green' : 'badge-red'
                        }`}
                      >
                        {m.type}
                      </span>
                    </td>
                    <td className="right">{m.quantity}</td>
                    <td>{m.referenceType}</td>
                    <td className="right">
                      <strong>{m.runningBalance}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-body">
        <div className="label">{label}</div>
        <div className="value" style={color ? { color } : undefined}>
          {Number(value).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
