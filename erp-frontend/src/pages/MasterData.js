import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import CrudPage from '../components/CrudPage';
import Icon from '../components/Icon';
import ExportButtons from '../components/ExportButtons';
import ItemsPanel from '../components/master/ItemsPanel';
import CategoriesPanel from '../components/master/CategoriesPanel';

const tiles = [
  {
    key: 'items',
    label: 'Items',
    icon: 'package',
    color: '#a78bfa',
    desc: 'Model no., brand, categories, pricing.',
  },
  {
    key: 'categories',
    label: 'Categories',
    icon: 'master',
    color: '#c084fc',
    desc: 'Self-referencing tree of product categories.',
  },
  {
    key: 'brands',
    label: 'Brands',
    icon: 'sparkles',
    color: '#f472b6',
    desc: 'Manufacturer brand list with descriptions.',
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: 'user',
    color: '#34d399',
    desc: 'Name, contact, opening balance, live A/R.',
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    icon: 'package',
    color: '#fbbf24',
    desc: 'Distributor list, A/P side, opening balance.',
  },
  {
    key: 'stores',
    label: 'Stores',
    icon: 'store',
    color: '#fb923c',
    desc: 'Multi-branch ready. Single store works fine.',
  },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: 'bank',
    color: '#22d3ee',
    desc: 'Cash, Bank, Wallet, Capital, Credit accounts.',
  },
  {
    key: 'employees',
    label: 'Employees',
    icon: 'users',
    color: '#818cf8',
    desc: 'Staff with salary, advances, attendance & incentive rules.',
  },
];

/**
 * Render a master-data panel. When called with no props, shows the full
 * Catalogue hub (tile grid + active panel). When called with `entity="…"`,
 * skips the hub and just renders that entity's panel with its own page-head
 * — used by entity-centric sidebar routes like `/customers`, `/items`, etc.
 */
export default function MasterData({ entity }) {
  const [active, setActive] = useState(entity ?? 'items');

  // If we're embedded as an entity-specific route, the URL drives the active
  // panel — keep state in sync if the route changes underneath us.
  useEffect(() => {
    if (entity) setActive(entity);
  }, [entity]);

  if (entity) {
    const tile = tiles.find((t) => t.key === entity);
    return (
      <>
        <div className="page-head">
          <div className="page-title">
            <h1>{tile?.label ?? 'Catalogue'}</h1>
            <p>{tile?.desc ?? ''}</p>
          </div>
        </div>
        <Panel active={entity} />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Catalogue</h1>
          <p>Items, categories, brands, parties, stores &amp; accounts.</p>
        </div>
      </div>

      <div className="grid-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tile ${active === t.key ? 'active' : ''}`}
            style={{
              '--tile-c': t.color,
              borderColor: active === t.key ? t.color : undefined,
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              background: 'var(--surface)',
            }}
            onClick={() => setActive(t.key)}
          >
            <span className="tile-icon" aria-hidden>
              <Icon name={t.icon} size={20} />
            </span>
            <div>
              <h3>{t.label}</h3>
              <p>{t.desc}</p>
            </div>
            <div className="tile-foot">
              {active === t.key ? 'Editing' : 'Open'}{' '}
              <Icon name="arrow-right" size={13} />
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <Panel active={active} />
      </div>
    </>
  );
}

function Panel({ active }) {
  switch (active) {
    case 'items':
      return <ItemsPanel />;
    case 'categories':
      return <CategoriesPanel />;
    case 'brands':
      return <BrandsPanel />;
    case 'customers':
      return <CustomersPanel />;
    case 'suppliers':
      return <SuppliersPanel />;
    case 'stores':
      return <StoresPanel />;
    case 'accounts':
      return <AccountsPanel />;
    case 'employees':
      // eslint-disable-next-line react/jsx-no-undef
      return <EmployeesPanel />;
    default:
      return null;
  }
}

function BrandsPanel() {
  return (
    <CrudPage
      title="Brands"
      path="/brands"
      searchKeys={['name', 'description']}
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
      searchKeys={['name', 'location']}
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

function EmployeesPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyEmployee());
  const [submitError, setSubmitError] = useState(null);
  const [query, setQuery] = useState('');

  const filtered = rows.filter((r) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return [r.name, r.role, r.phone, r.email]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(term));
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get('/reports/employee-balances')
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
  }, []);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/reports/employee-balances');
      setRows(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const startAdd = () => {
    setEditing(null);
    setForm(emptyEmployee());
    setShowForm(true);
    setSubmitError(null);
  };

  const startEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      role: row.role ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
      monthlySalary: row.monthlySalary ?? '',
      openingBalance: row.openingBalance ?? '',
      joinedAt: row.joinedAt ?? '',
      notes: row.notes ?? '',
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
      role: form.role?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      email: form.email?.trim() || undefined,
      address: form.address?.trim() || undefined,
      monthlySalary:
        form.monthlySalary === '' ? undefined : Number(form.monthlySalary),
      openingBalance:
        form.openingBalance === '' ? undefined : Number(form.openingBalance),
      joinedAt: form.joinedAt || undefined,
      notes: form.notes?.trim() || undefined,
      isActive: form.isActive,
    };
    try {
      if (editing) await api.patch(`/employees/${editing.id}`, payload);
      else await api.post('/employees', payload);
      setShowForm(false);
      reload();
    } catch (err) {
      setSubmitError(err.uiMessage ?? 'Save failed');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.name}?`)) return;
    try {
      await api.delete(`/employees/${row.id}`);
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Delete failed');
    }
  };

  const toggleActive = async (row) => {
    const verb = row.isActive ? 'Close' : 'Reopen';
    if (!window.confirm(`${verb} ${row.name}?`)) return;
    try {
      await api.patch(`/employees/${row.id}`, { isActive: !row.isActive });
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Update failed');
    }
  };

  return (
    <>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3>Employees</h3>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <ExportButtons
            filename="employees"
            title="Employees"
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'phone', label: 'Phone' },
              { key: 'monthlySalary', label: 'Salary', align: 'right' },
              { key: 'balance', label: 'Balance', align: 'right' },
              { key: 'isActive', label: 'Active' },
            ]}
            rows={filtered}
          />
          <button className="btn btn-sm btn-primary" onClick={startAdd}>
            + Add Employee
          </button>
        </div>
      </div>

      {error && <div className="chip chip-danger">{error}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <label>Quick search</label>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type name, role, phone, or email…"
        />
      </div>

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h4 style={{ marginTop: 0 }}>{editing ? 'Edit Employee' : 'New Employee'}</h4>
          {submitError && (
            <div className="chip chip-danger" style={{ marginBottom: 10 }}>
              {submitError}
            </div>
          )}
          <div className="form-row">
            <div>
              <label>Name *</label>
              <input
                className="input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label>Role</label>
              <input
                className="input"
                value={form.role}
                placeholder="e.g. Cashier, Salesman"
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </div>
            <div>
              <label>Phone</label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label>Monthly salary</label>
              <input
                className="input"
                type="number"
                step="any"
                value={form.monthlySalary}
                onChange={(e) =>
                  setForm({ ...form, monthlySalary: e.target.value })
                }
              />
            </div>
            <div>
              <label>Opening balance</label>
              <input
                className="input"
                type="number"
                step="any"
                value={form.openingBalance}
                onChange={(e) =>
                  setForm({ ...form, openingBalance: e.target.value })
                }
              />
            </div>
            <div>
              <label>Joined on</label>
              <input
                className="input"
                type="date"
                value={form.joinedAt}
                onChange={(e) =>
                  setForm({ ...form, joinedAt: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label>Address</label>
            <textarea
              className="input"
              style={{ height: 'auto', padding: '10px 14px' }}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label>Notes</label>
            <textarea
              className="input"
              style={{ height: 'auto', padding: '10px 14px' }}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
      ) : filtered.length === 0 ? (
        <div className="card muted center">
          {query.trim() ? 'No matches.' : 'No employees yet.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Phone</th>
                <th className="num">Salary</th>
                <th className="num">Balance</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const bal = Number(r.balance ?? 0);
                const cls = bal > 0 ? 'chip-warn' : bal < 0 ? 'chip-info' : '';
                return (
                  <tr key={r.id} style={!r.isActive ? { opacity: 0.55 } : undefined}>
                    <td>
                      <strong>{r.name}</strong>
                      {!r.isActive && (
                        <span className="chip" style={{ marginLeft: 6, height: 'auto', padding: '2px 8px' }}>
                          CLOSED
                        </span>
                      )}
                    </td>
                    <td>{r.role ?? '—'}</td>
                    <td>{r.phone ?? '—'}</td>
                    <td className="num">{Number(r.monthlySalary ?? 0).toFixed(2)}</td>
                    <td className="num">
                      <span className={`chip ${cls}`}>
                        {Math.abs(bal).toFixed(2)} {bal > 0 ? '· we owe' : bal < 0 ? '· they owe' : '· settled'}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${r.isActive ? 'chip-success' : ''}`}>
                        {r.isActive ? 'Active' : 'Closed'}
                      </span>
                    </td>
                    <td className="num">
                      <Link className="btn btn-sm" to={`/employee-ledger/${r.id}`}>
                        Ledger
                      </Link>{' '}
                      <button className="btn btn-sm" onClick={() => startEdit(r)}>
                        Edit
                      </button>{' '}
                      <button className="btn btn-sm" onClick={() => toggleActive(r)}>
                        {r.isActive ? 'Close' : 'Reopen'}
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
        </div>
      )}
    </>
  );
}

function emptyEmployee() {
  return {
    name: '',
    role: '',
    phone: '',
    email: '',
    address: '',
    monthlySalary: '',
    openingBalance: '',
    joinedAt: '',
    notes: '',
    isActive: true,
  };
}

function AccountsPanel() {
  return (
    <CrudPage
      title="Accounts (Cash / Bank / Wallet / Capital / Credit)"
      path="/accounts"
      searchKeys={['name', 'type', 'bank', 'accountNumber']}
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
            { value: 'CASH', label: 'Cash (physical till)' },
            { value: 'BANK', label: 'Bank account' },
            { value: 'WALLET', label: 'Mobile wallet (Easypaisa, JazzCash…)' },
            { value: 'CAPITAL', label: 'Owner Capital / Equity' },
            { value: 'CREDIT', label: 'Credit card / Credit line' },
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
  const [query, setQuery] = useState('');

  const filtered = rows.filter((r) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return [r.name, r.phone, r.email, r.address]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(term));
  });

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

  const toggleActive = async (row) => {
    const verb = row.isActive ? 'Close' : 'Reopen';
    if (!window.confirm(`${verb} ${row.name}?`)) return;
    try {
      await api.patch(`${basePath}/${row.id}`, { isActive: !row.isActive });
      reload();
    } catch (err) {
      alert(err.uiMessage ?? 'Update failed');
    }
  };

  return (
    <>
      <div className="panel-header">
        <h3>{title}</h3>
        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <ExportButtons
            filename={title.toLowerCase()}
            title={title}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
              { key: 'address', label: 'Address' },
              { key: 'openingBalance', label: 'Opening', align: 'right' },
              { key: 'balance', label: 'Balance', align: 'right' },
              {
                key: 'status',
                label: 'Status',
                value: (r) => balanceLabel(Number(r.balance ?? 0)),
              },
              { key: 'isActive', label: 'Active' },
            ]}
            rows={filtered}
          />
          <button className="btn btn-primary" onClick={startAdd}>
            + Add {title.replace(/s$/, '')}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <label>Quick search</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Type name, phone, email, or address…`}
        />
        {query.trim() && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {filtered.length} of {rows.length}
          </div>
        )}
      </div>

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
      ) : filtered.length === 0 ? (
        <div className="card muted center">
          {query.trim() ? 'No matches.' : 'No records yet.'}
        </div>
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
            {filtered.map((r) => {
              const bal = Number(r.balance ?? 0);
              const cls = bal > 0 ? 'badge-red' : bal < 0 ? 'badge-green' : 'badge-gray';
              const isActive = r.isActive ?? true;
              return (
                <tr
                  key={r.id}
                  style={!isActive ? { opacity: 0.55 } : undefined}
                >
                  <td>
                    {r.name}
                    {!isActive && (
                      <span
                        className="badge badge-gray"
                        style={{ marginLeft: 6, fontSize: 10 }}
                      >
                        CLOSED
                      </span>
                    )}
                  </td>
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
                      className="btn btn-sm"
                      onClick={() => toggleActive(r)}
                      title={
                        isActive
                          ? 'Mark as closed (kept in records, hidden from new transactions)'
                          : 'Reopen this party'
                      }
                    >
                      {isActive ? 'Close' : 'Reopen'}
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
// trigger recompile
