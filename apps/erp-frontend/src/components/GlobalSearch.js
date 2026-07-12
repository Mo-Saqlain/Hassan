import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Icon from './Icon';

/**
 * Global topbar search. Loads light-weight lists of customers, suppliers,
 * employees, accounts, and items into memory on first focus, then filters
 * them client-side as the user types. Up to 8 best matches show in a
 * popover; clicking one navigates to that entity's most useful page
 * (ledger for parties/accounts, master-data tile for items).
 *
 * Filter matches against the entity's name and any short identifier
 * (code, sku, modelNo, barcode, phone). The customer/supplier/employee/
 * account codes are auto-generated (CUST-/SUPP-/EMP-/ACC-) so typing a
 * code like "CUST-000001" reliably finds the row.
 */
export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null); // {customers, suppliers, employees, accounts, items} or null
  const [loadError, setLoadError] = useState(null);
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const loadData = () => {
    if (data || loadError) return;
    Promise.all([
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/employees'),
      api.get('/accounts'),
      api.get('/items'),
    ])
      .then(([c, s, e, a, i]) => {
        setData({
          customers: c.data,
          suppliers: s.data,
          employees: e.data,
          accounts: a.data,
          items: i.data,
        });
      })
      .catch((err) => setLoadError(err.uiMessage ?? 'Failed to load'));
  };

  useEffect(() => {
    const handler = (ev) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !data) return [];
    const match = (row, fields) =>
      fields.some((f) => row[f] != null && String(row[f]).toLowerCase().includes(term));

    const hits = [];
    for (const c of data.customers) {
      if (match(c, ['code', 'name', 'phone', 'email'])) {
        hits.push({
          kind: 'Customer',
          tint: '#34d399',
          icon: 'user',
          code: c.code,
          name: c.name,
          sub: c.phone ?? c.email ?? '',
          to: `/customer-ledger/${c.id}`,
        });
      }
    }
    for (const s of data.suppliers) {
      if (match(s, ['code', 'name', 'phone', 'email'])) {
        hits.push({
          kind: 'Supplier',
          tint: '#fbbf24',
          icon: 'package',
          code: s.code,
          name: s.name,
          sub: s.phone ?? s.email ?? '',
          to: `/supplier-ledger/${s.id}`,
        });
      }
    }
    for (const e of data.employees) {
      if (match(e, ['code', 'name', 'phone', 'email', 'role'])) {
        hits.push({
          kind: 'Employee',
          tint: '#818cf8',
          icon: 'users',
          code: e.code,
          name: e.name,
          sub: e.role ?? e.phone ?? '',
          to: `/employee-ledger/${e.id}`,
        });
      }
    }
    for (const a of data.accounts) {
      if (match(a, ['code', 'name', 'bank', 'accountNumber'])) {
        hits.push({
          kind: 'Account',
          tint: '#22d3ee',
          icon: 'bank',
          code: a.code,
          name: a.name,
          sub: a.type ?? '',
          to: `/account-ledger/${a.id}`,
        });
      }
    }
    for (const it of data.items) {
      if (match(it, ['sku', 'barcode', 'modelNo', 'name'])) {
        hits.push({
          kind: 'Item',
          tint: '#a78bfa',
          icon: 'package',
          code: it.sku,
          name: it.name,
          sub: it.modelNo ?? it.barcode ?? '',
          to: `/items`,
        });
      }
    }
    return hits.slice(0, 8);
  }, [query, data]);

  const onFocus = () => {
    loadData();
    setOpen(true);
  };

  const onSelect = (r) => {
    setOpen(false);
    setQuery('');
    navigate(r.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Enter' && results[0]) {
      onSelect(results[0]);
    }
  };

  return (
    <div className="search" ref={wrapRef}>
      <Icon name="search" size={15} />
      <input
        ref={inputRef}
        className="input"
        placeholder="Search by code, name, phone, SKU…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
      {open && query.trim() && (
        <div className="search-results">
          {loadError && (
            <div className="search-empty" style={{ color: 'var(--text-danger, #f87171)' }}>
              {loadError}
            </div>
          )}
          {!loadError && !data && (
            <div className="search-empty">Loading…</div>
          )}
          {data && results.length === 0 && (
            <div className="search-empty">No matches.</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.code ?? r.name}-${i}`}
              type="button"
              className="search-result"
              onClick={() => onSelect(r)}
            >
              <span className="search-result-icon" style={{ background: r.tint }}>
                <Icon name={r.icon} size={13} />
              </span>
              <span className="search-result-body">
                <span className="search-result-name">
                  {r.name}
                  {r.code && <code className="search-result-code">{r.code}</code>}
                </span>
                {r.sub && <span className="search-result-sub">{r.sub}</span>}
              </span>
              <span className="search-result-kind">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
