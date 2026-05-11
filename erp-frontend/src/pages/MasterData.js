import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import CrudPage from '../components/CrudPage';
import Icon from '../components/Icon';
import ItemsPanel from '../components/master/ItemsPanel';
import CategoriesPanel from '../components/master/CategoriesPanel';

const tiles = [
  { key: 'items',      label: 'Items',       icon: 'box',        color: 'var(--tile-items)' },
  { key: 'categories', label: 'Categories',  icon: 'folderTree', color: 'var(--tile-categories)' },
  { key: 'brands',     label: 'Brands',      icon: 'tag',        color: 'var(--tile-brands)' },
  { key: 'customers',  label: 'Customers',   icon: 'users',      color: 'var(--tile-customers)' },
  { key: 'suppliers',  label: 'Suppliers',   icon: 'truck',      color: 'var(--tile-suppliers)' },
  { key: 'stores',     label: 'Stores',      icon: 'store',      color: 'var(--tile-stores)' },
  { key: 'accounts',   label: 'Bank/Wallet', icon: 'card',       color: 'var(--tile-accounts)' },
];

export default function MasterData() {
  const [active, setActive] = useState('items');

  return (
    <>
      <div className="page-header">
        <h2>Master Data</h2>
      </div>

      <div className="tile-grid">
        {tiles.map((t) => (
          <button
            key={t.key}
            className={`tile ${active === t.key ? 'tile-active' : ''}`}
            onClick={() => setActive(t.key)}
          >
            <span className="tile-icon" style={{ background: t.color }} aria-hidden>
              <Icon name={t.icon} size={22} />
            </span>
            <span className="tile-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="panel">
        {active === 'items' && <ItemsPanel />}
        {active === 'categories' && <CategoriesPanel />}
        {active === 'brands' && <BrandsPanel />}
        {active === 'customers' && <CustomersPanel />}
        {active === 'suppliers' && <SuppliersPanel />}
        {active === 'stores' && <StoresPanel />}
        {active === 'accounts' && <AccountsPanel />}
      </div>
    </>
  );
}

function BrandsPanel() {
  return (
    <CrudPage
      title="Brands"
      path="/brands"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Description' },
        {
          key: 'isActive',
          label: 'Active',
          render: (r) => (
            <span className={`badge ${r.isActive ? 'badge-green' : 'badge-gray'}`}>
              {r.isActive ? 'Yes' : 'No'}
            </span>
          ),
        },
      ]}
      formFields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'description', label: 'Description' },
        { key: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
    />
  );
}

function CustomersPanel() {
  return (
    <PartyPanel
      title="Customers"
      basePath="/customers"
      balancesPath="/reports/customer-balances"
      ledgerRoute="customer-ledger"
      balanceLabel={(b) =>
        b > 0 ? 'Owes us' : b < 0 ? 'We owe them' : 'Settled'
      }
    />
  );
}

function SuppliersPanel() {
  return (
    <PartyPanel
      title="Suppliers"
      basePath="/suppliers"
      balancesPath="/reports/supplier-balances"
      ledgerRoute="supplier-ledger"
      balanceLabel={(b) =>
        b > 0 ? 'We owe them' : b < 0 ? 'They owe us' : 'Settled'
      }
    />
  );
}

function StoresPanel() {
  return (
    <CrudPage
      title="Stores / Branches"
      path="/stores"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'location', label: 'Location' },
        {
          key: 'isActive',
          label: 'Active',
          render: (r) => (
            <span className={`badge ${r.isActive ? 'badge-green' : 'badge-gray'}`}>
              {r.isActive ? 'Yes' : 'No'}
            </span>
          ),
        },
      ]}
      formFields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'location', label: 'Location' },
        { key: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
    />
  );
}

function AccountsPanel() {
  return (
    <CrudPage
      title="Bank / Wallet Accounts"
      path="/accounts"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type' },
        { key: 'bank', label: 'Bank' },
        { key: 'accountNumber', label: 'Account #' },
        { key: 'openingBalance', label: 'Opening Bal.', align: 'right' },
      ]}
      formFields={[
        { key: 'name', label: 'Name', required: true },
        {
          key: 'type',
          label: 'Type',
          type: 'select',
          options: [
            { value: 'CASH', label: 'Cash' },
            { value: 'BANK', label: 'Bank' },
            { value: 'WALLET', label: 'Wallet' },
          ],
          defaultValue: 'CASH',
          required: true,
        },
        { key: 'bank', label: 'Bank Name' },
        { key: 'accountNumber', label: 'Account #' },
        { key: 'openingBalance', label: 'Opening Balance', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
    />
  );
}

/**
 * Customer/Supplier panel — fetches the list with computed balances and links
 * each row to its ledger. CRUD operations hit the basic /customers (or /suppliers) endpoint.
 */
function PartyPanel({ title, basePath, balancesPath, ledgerRoute, balanceLabel }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(balancesPath)
      .then((r) => {
        if (!cancelled) setRows(r.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.uiMessage ?? 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [balancesPath]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(balancesPath);
      setRows(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const startAdd = () => {
    setEditing(null);
    setForm({ name: '', phone: '', email: '', address: '', openingBalance: '', isActive: true });
    setShowForm(true);
    setSubmitError(null);
  };

  const startEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
      openingBalance: row.openingBalance ?? '',
      isActive: row.isActive ?? true,
    });
    setShowForm(true);
    setSubmitError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const payload = {
      name: form.name.trim(),
      phone: form.phone?.trim() || undefined,
      email: form.email?.trim() || undefined,
      address: form.address?.trim() || undefined,
      openingBalance:
        form.openingBalance === '' ? undefined : Number(form.openingBalance),
      isActive: form.isActive,
    };
    try {
      if (editing) await api.patch(`${basePath}/${editing.id}`, payload);
      else await api.post(basePath, payload);
      setShowForm(false);
      reload();
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.name}?`)) return;
    try {
      await api.delete(`${basePath}/${row.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  return (
    <>
      <div className="panel-header">
        <h3>{title}</h3>
        <button className="btn btn-primary" onClick={startAdd}>
          + Add {title.replace(/s$/, '')}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h4 style={{ marginTop: 0 }}>{editing ? 'Edit' : 'New'}</h4>
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
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label>Opening Balance</label>
              <input
                type="number"
                step="any"
                value={form.openingBalance}
                onChange={(e) =>
                  setForm({ ...form, openingBalance: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label>Address</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active
            </label>
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
      ) : rows.length === 0 ? (
        <div className="card muted center">No records yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th className="right">Opening</th>
              <th className="right">Balance</th>
              <th>Status</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bal = Number(r.balance ?? 0);
              const cls = bal > 0 ? 'badge-red' : bal < 0 ? 'badge-green' : 'badge-gray';
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.phone ?? '—'}</td>
                  <td>{r.email ?? '—'}</td>
                  <td className="right">{Number(r.openingBalance ?? 0).toFixed(2)}</td>
                  <td className="right">
                    <span className={`badge ${cls}`}>
                      {Math.abs(bal).toFixed(2)}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {balanceLabel(bal)}
                  </td>
                  <td className="right">
                    <Link className="btn btn-sm" to={`/${ledgerRoute}/${r.id}`}>
                      Ledger
                    </Link>{' '}
                    <button className="btn btn-sm" onClick={() => startEdit(r)}>
                      Edit
                    </button>{' '}
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => remove(r)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
