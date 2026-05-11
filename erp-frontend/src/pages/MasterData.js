import { useState } from 'react';
import CrudPage from '../components/CrudPage';
import ItemsPanel from '../components/master/ItemsPanel';
import CategoriesPanel from '../components/master/CategoriesPanel';

const tiles = [
  { key: 'items', label: 'Items', icon: '📦', accent: '#2563eb' },
  { key: 'categories', label: 'Categories', icon: '🗂️', accent: '#7c3aed' },
  { key: 'brands', label: 'Brands', icon: '🏷️', accent: '#0891b2' },
  { key: 'customers', label: 'Customers', icon: '👥', accent: '#16a34a' },
  { key: 'suppliers', label: 'Suppliers', icon: '🚚', accent: '#d97706' },
  { key: 'stores', label: 'Stores', icon: '🏬', accent: '#dc2626' },
  { key: 'accounts', label: 'Bank/Wallet', icon: '💳', accent: '#0d9488' },
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
            style={active === t.key ? { borderColor: t.accent, color: t.accent } : undefined}
            onClick={() => setActive(t.key)}
          >
            <span className="tile-icon" aria-hidden>{t.icon}</span>
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
    <CrudPage
      title="Customers"
      path="/customers"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'openingBalance', label: 'Opening Bal.', align: 'right' },
      ]}
      formFields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'address', label: 'Address', type: 'textarea' },
        { key: 'openingBalance', label: 'Opening Balance', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
    />
  );
}

function SuppliersPanel() {
  return (
    <CrudPage
      title="Suppliers"
      path="/suppliers"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'openingBalance', label: 'Opening Bal.', align: 'right' },
      ]}
      formFields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'address', label: 'Address', type: 'textarea' },
        { key: 'openingBalance', label: 'Opening Balance', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
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
