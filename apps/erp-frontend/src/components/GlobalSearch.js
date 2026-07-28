import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Icon from './Icon';

/**
 * Global topbar search — one box for everything the shop can look up.
 *
 * Queries `GET /search?q=` (debounced) and renders the grouped hits. It used to
 * pull the whole customer, supplier, employee, account and item tables into
 * memory on first focus and filter them in JS, which meant documents were
 * unfindable — you could not search an invoice number anywhere in the app — and
 * the payload grew with the catalogue. Matching in SQL covers every voucher type
 * as well as the parties, and only the handful of hits crosses the wire.
 *
 * Two characters minimum, matching the endpoint.
 */

/** Presentation per hit kind: tint, icon, and the label shown on the right. */
const KIND_STYLE = {
  customer: { tint: '#34d399', icon: 'user', label: 'Customer' },
  supplier: { tint: '#fbbf24', icon: 'package', label: 'Supplier' },
  employee: { tint: '#818cf8', icon: 'users', label: 'Employee' },
  account: { tint: '#22d3ee', icon: 'bank', label: 'Account' },
  item: { tint: '#a78bfa', icon: 'package', label: 'Item' },
  sale: { tint: '#0078d4', icon: 'receipt', label: 'Sale' },
  purchase: { tint: '#8764b8', icon: 'cart', label: 'Bill' },
  saleReturn: { tint: '#fb923c', icon: 'transfer', label: 'Sale return' },
  purchaseReturn: { tint: '#fb923c', icon: 'transfer', label: 'Purchase return' },
  payment: { tint: '#107c10', icon: 'cash', label: 'Voucher' },
  stockTransfer: { tint: '#6b7280', icon: 'transfer', label: 'Stock transfer' },
  fundTransfer: { tint: '#6b7280', icon: 'transfer', label: 'Fund transfer' },
  serviceTicket: { tint: '#f472b6', icon: 'bolt', label: 'Service' },
  delivery: { tint: '#fbbf24', icon: 'truck', label: 'Delivery' },
};

const fallbackStyle = { tint: '#6b7280', icon: 'search', label: '' };

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (ev) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced server search. The timer is cleared on every keystroke so a fast
  // typist issues one request, not one per character.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setError(null);
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      let cancelled = false;
      api
        .get('/search', { params: { q: term } })
        .then((res) => {
          if (cancelled) return;
          // Flatten the groups into one ranked list, keeping the group order the
          // server chose (parties first, then documents).
          const flat = [];
          for (const group of res.data?.groups ?? []) {
            for (const hit of group.hits) flat.push(hit);
          }
          setHits(flat.slice(0, 12));
          setError(null);
        })
        .catch((err) => {
          if (!cancelled) setError(err.uiMessage ?? 'Search failed');
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
      return () => {
        cancelled = true;
      };
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const onSelect = (hit) => {
    setOpen(false);
    setQuery('');
    if (hit.route) navigate(hit.route);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Enter' && hits[0]) {
      onSelect(hits[0]);
    }
  };

  const term = query.trim();

  return (
    <div className="search" ref={wrapRef}>
      <Icon name="search" size={15} />
      <input
        ref={inputRef}
        className="input"
        placeholder="Search invoice, bill, voucher, name, phone, SKU…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && term && (
        <div className="search-results">
          {error && (
            <div
              className="search-empty"
              style={{ color: 'var(--text-danger, #f87171)' }}
            >
              {error}
            </div>
          )}
          {!error && term.length < 2 && (
            <div className="search-empty">Type at least 2 characters.</div>
          )}
          {!error && term.length >= 2 && busy && hits.length === 0 && (
            <div className="search-empty">Searching…</div>
          )}
          {!error && term.length >= 2 && !busy && hits.length === 0 && (
            <div className="search-empty">No matches.</div>
          )}
          {hits.map((hit, i) => {
            const style = KIND_STYLE[hit.kind] ?? fallbackStyle;
            return (
              <button
                key={`${hit.kind}-${hit.id}-${i}`}
                type="button"
                className="search-result"
                onClick={() => onSelect(hit)}
              >
                <span
                  className="search-result-icon"
                  style={{ background: style.tint }}
                >
                  <Icon name={style.icon} size={13} />
                </span>
                <span className="search-result-body">
                  <span className="search-result-name">
                    {hit.label}
                    {hit.reversed && (
                      <code className="search-result-code">reversed</code>
                    )}
                  </span>
                  {(hit.sub || hit.amount != null) && (
                    <span className="search-result-sub">
                      {[
                        hit.sub,
                        hit.amount != null && hit.amount !== 0
                          ? `Rs ${Number(hit.amount).toLocaleString('en-PK')}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <span className="search-result-kind">{style.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
