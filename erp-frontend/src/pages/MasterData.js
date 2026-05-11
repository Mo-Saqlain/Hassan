import { useState } from 'react';
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
