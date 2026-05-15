import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import Icon from '../components/Icon';

export default function POS() {
  const [session, setSession] = useState(null);
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [stores, setStores] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [openingFloat, setOpeningFloat] = useState('');

  const [code, setCode] = useState('');
  const [scanError, setScanError] = useState(null);

  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [accountId, setAccountId] = useState('');
  const [discount, setDiscount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [checkoutError, setCheckoutError] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  const [busy, setBusy] = useState(false);

  // New Customer modal
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  });
  const [newCustomerError, setNewCustomerError] = useState(null);
  const [newCustomerBusy, setNewCustomerBusy] = useState(false);

  const newCustomerDirty =
    showCustomerModal &&
    (newCustomer.name !== '' ||
      newCustomer.phone !== '' ||
      newCustomer.email !== '' ||
      newCustomer.address !== '');
  useUnsavedChangesPrompt(newCustomerDirty);

  const scanInputRef = useRef(null);

  const loadCart = useCallback(async (sessionId) => {
    const r = await api.get(`/pos/sessions/${sessionId}/cart`);
    setCart(r.data);
  }, []);

  // Bootstrap: fetch active session, customers, stores, accounts
  useEffect(() => {
    (async () => {
      try {
        const [active, cust, str, acct] = await Promise.all([
          api.get('/pos/sessions/active'),
          api.get('/customers'),
          api.get('/stores'),
          api.get('/accounts'),
        ]);
        setCustomers(cust.data);
        setStores(str.data);
        setAccounts(acct.data);
        if (active.data) {
          setSession(active.data);
          await loadCart(active.data.id);
        }
      } catch (e) {
        // ignore boot errors
      }
    })();
  }, [loadCart]);

  // Keep scan input focused while a session is active.
  useEffect(() => {
    if (session && scanInputRef.current) scanInputRef.current.focus();
  }, [session, cart.length]);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + Number(l.total), 0),
    [cart],
  );
  const disc = Number(discount || 0);
  const net = Math.max(0, subtotal - disc);
  // CREDIT means "pay later" — paidAmount is forced to 0, full net is owed.
  const isCredit = paymentMethod === 'CREDIT';
  const paid = isCredit ? 0 : (paidAmount === '' ? net : Number(paidAmount || 0));
  const change = paid - net;
  const receivable = Math.max(0, net - paid);
  const isPartial = receivable > 0;

  // Filter the account picker by payment method:
  //  - CASH → CASH-typed accounts only (cash drawer)
  //  - CARD/BANK → BANK + WALLET accounts (no cash drawer)
  const accountTypeFilter = useMemo(() => {
    if (paymentMethod === 'CASH') return ['CASH'];
    if (paymentMethod === 'CARD' || paymentMethod === 'BANK')
      return ['BANK', 'WALLET'];
    return [];
  }, [paymentMethod]);
  const eligibleAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.isActive !== false && accountTypeFilter.includes(a.type),
      ),
    [accounts, accountTypeFilter],
  );

  // When the payment method changes, reset to a sensible default account
  // (single match if there's only one, otherwise clear).
  useEffect(() => {
    if (isCredit) {
      setAccountId('');
      return;
    }
    if (eligibleAccounts.length === 1) {
      setAccountId(eligibleAccounts[0].id);
    } else if (!eligibleAccounts.some((a) => a.id === accountId)) {
      setAccountId('');
    }
  }, [paymentMethod, eligibleAccounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const startSession = async (storeId) => {
    setBusy(true);
    try {
      const r = await api.post('/pos/sessions', {
        storeId: storeId || undefined,
        openingFloat: openingFloat === '' ? 0 : Number(openingFloat),
      });
      setSession(r.data);
      setCart([]);
    } catch (e) {
      alert(e.uiMessage ?? 'Could not start session');
    } finally {
      setBusy(false);
    }
  };

  const closeSession = async () => {
    if (!session) return;
    if (!window.confirm('Close this POS session?')) return;
    setBusy(true);
    try {
      await api.post(`/pos/sessions/${session.id}/close`, {});
      setSession(null);
      setCart([]);
      setLastSale(null);
    } catch (e) {
      alert(e.uiMessage ?? 'Could not close session');
    } finally {
      setBusy(false);
    }
  };

  const onScanSubmit = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || !session) return;
    setScanError(null);
    try {
      await api.post(`/pos/sessions/${session.id}/cart`, {
        code: trimmed,
        quantity: 1,
      });
      setCode('');
      await loadCart(session.id);
    } catch (err) {
      setScanError(err.uiMessage ?? 'Item not found');
    }
  };

  const updateLine = async (line, qty) => {
    if (qty < 1) return removeLine(line);
    try {
      await api.patch(`/pos/cart/${line.id}`, { quantity: qty });
      await loadCart(session.id);
    } catch (err) {
      alert(err.uiMessage ?? 'Update failed');
    }
  };

  const removeLine = async (line) => {
    try {
      await api.delete(`/pos/cart/${line.id}`);
      await loadCart(session.id);
    } catch (err) {
      alert(err.uiMessage ?? 'Remove failed');
    }
  };

  const clearCart = async () => {
    if (cart.length === 0) return;
    if (!window.confirm('Clear cart?')) return;
    try {
      await api.delete(`/pos/sessions/${session.id}/cart`);
      await loadCart(session.id);
    } catch (err) {
      alert(err.uiMessage ?? 'Clear failed');
    }
  };

  const checkout = async () => {
    if (!session || cart.length === 0) return;
    // Local guard rails before hitting the API — surface the same rules
    // the backend enforces, but with friendlier copy.
    if ((isCredit || isPartial) && !customerId) {
      setCheckoutError(
        isCredit
          ? 'Pick a customer for credit sales — the full amount becomes their receivable.'
          : `Pick a customer for partial payments — ${receivable.toFixed(2)} will be tracked as a receivable.`,
      );
      return;
    }
    if (!isCredit && eligibleAccounts.length > 0 && !accountId) {
      setCheckoutError('Pick which account is receiving the money.');
      return;
    }
    setBusy(true);
    setCheckoutError(null);
    try {
      const r = await api.post(`/pos/sessions/${session.id}/checkout`, {
        paymentMethod,
        customerId: customerId || undefined,
        accountId: isCredit ? undefined : (accountId || undefined),
        discount: disc,
        paidAmount: isCredit
          ? 0
          : paidAmount === ''
            ? undefined
            : paid,
      });
      setLastSale(r.data);
      setCart([]);
      setDiscount('');
      setPaidAmount('');
      setCustomerId('');
      // refresh session totals
      const refreshed = await api.get(`/pos/sessions/${session.id}`);
      setSession(refreshed.data);
      // refocus scan input
      setTimeout(() => scanInputRef.current?.focus(), 0);
    } catch (err) {
      setCheckoutError(err.uiMessage ?? 'Checkout failed');
    } finally {
      setBusy(false);
    }
  };

  const submitNewCustomer = async (e) => {
    e.preventDefault();
    setNewCustomerError(null);
    setNewCustomerBusy(true);
    try {
      const payload = {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || undefined,
        email: newCustomer.email.trim() || undefined,
        address: newCustomer.address.trim() || undefined,
      };
      const r = await api.post('/customers', payload);
      // Refresh and auto-select the new customer.
      const list = await api.get('/customers');
      setCustomers(list.data);
      setCustomerId(r.data.id);
      setShowCustomerModal(false);
      setNewCustomer({ name: '', phone: '', email: '', address: '' });
    } catch (err) {
      setNewCustomerError(err.uiMessage ?? 'Could not create customer');
    } finally {
      setNewCustomerBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────
  if (!session) {
    return (
      <>
        <div className="page-header">
          <h2>POS</h2>
        </div>
        <div className="card" style={{ maxWidth: 460 }}>
          <h3 style={{ marginTop: 0 }}>Start a POS Session</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            Open a cashier session before billing. Cart and totals are tracked per session.
          </p>
          <div className="form-row">
            <div>
              <label>Store (optional)</label>
              <select id="pos-store" defaultValue="">
                <option value="">— None —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Opening cash float</label>
              <input
                type="number"
                step="any"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              const select = document.getElementById('pos-store');
              startSession(select?.value || '');
            }}
          >
            Start Session
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>POS</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Session {session.id.slice(0, 8)} · started{' '}
            {new Date(session.startedAt).toLocaleTimeString()} ·{' '}
            {session.salesCount} sales · {Number(session.salesTotal).toFixed(2)}
          </span>
          <button className="btn" onClick={closeSession} disabled={busy}>
            Close Session
          </button>
        </div>
      </div>

      {lastSale && (
        <div className="alert alert-success" style={{ marginBottom: 12 }}>
          Sale {lastSale.invoiceNo} saved — net {Number(lastSale.netAmount).toFixed(2)}, paid{' '}
          {Number(lastSale.paidAmount).toFixed(2)}
          {Number(lastSale.dueAmount) < 0 && (
            <> · Change due: {(-Number(lastSale.dueAmount)).toFixed(2)}</>
          )}
          {' '}
          <a
            href={`#/print/sale/${lastSale.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Print receipt
          </a>
        </div>
      )}

      <div className="pos-grid">
        <div>
          <form onSubmit={onScanSubmit} className="card" style={{ padding: 18 }}>
            <div style={{ position: 'relative' }}>
              <Icon
                name="bolt"
                size={16}
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--violet-400)',
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={scanInputRef}
                autoFocus
                className="input"
                value={code}
                placeholder="Type model no. — e.g. DAWLANCE LVS-15"
                onChange={(e) => setCode(e.target.value)}
                style={{
                  paddingLeft: 38,
                  height: 46,
                  fontSize: 14,
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
            {scanError && (
              <div
                className="chip chip-danger"
                style={{ marginTop: 10, height: 'auto', padding: '6px 12px' }}
              >
                {scanError}
              </div>
            )}
          </form>

          {cart.length === 0 ? (
            <div
              className="card"
              style={{
                padding: 40,
                color: 'var(--text-muted)',
                textAlign: 'center',
                fontSize: 13,
              }}
            >
              Cart is empty. Type a model no. above to add.
            </div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((ln) => (
                  <tr key={ln.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {ln.item?.modelNo ?? ln.item?.name ?? ln.itemId}
                      </div>
                      {ln.item?.brand?.name && (
                        <div
                          className="muted"
                          style={{
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {ln.item.brand.name}
                        </div>
                      )}
                    </td>
                    <td className="right" style={{ width: 110 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => updateLine(ln, ln.quantity - 1)}
                        >
                          −
                        </button>
                        <span style={{ minWidth: 28, textAlign: 'center' }}>
                          {ln.quantity}
                        </span>
                        <button
                          className="btn btn-sm"
                          onClick={() => updateLine(ln, ln.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="right">{Number(ln.price).toFixed(2)}</td>
                    <td className="right">{Number(ln.total).toFixed(2)}</td>
                    <td className="right">
                      <button className="btn btn-sm btn-danger" onClick={() => removeLine(ln)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="card pos-summary">
          <h3 style={{ marginTop: 0 }}>Checkout</h3>

          <div className="totals">
            <div><span>Subtotal</span><span>{subtotal.toFixed(2)}</span></div>
            <div>
              <span>Discount</span>
              <input
                type="number"
                step="any"
                style={{ width: 100, textAlign: 'right' }}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="net"><span>Net</span><span>{net.toFixed(2)}</span></div>
            <div>
              <span>Paid</span>
              <input
                type="number"
                step="any"
                style={{ width: 100, textAlign: 'right' }}
                value={isCredit ? '0' : paidAmount}
                disabled={isCredit}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder={net.toFixed(2)}
              />
            </div>
            <div className="net">
              <span>
                {isCredit
                  ? 'Receivable'
                  : isPartial
                    ? 'Receivable'
                    : change >= 0
                      ? 'Change'
                      : 'Due'}
              </span>
              <span>
                {isCredit
                  ? net.toFixed(2)
                  : isPartial
                    ? receivable.toFixed(2)
                    : Math.abs(change).toFixed(2)}
              </span>
            </div>
          </div>

          {(isCredit || isPartial) && (
            <div
              className="alert"
              style={{
                background: 'var(--info-soft)',
                color: 'var(--info)',
                borderColor: 'var(--info)',
                fontSize: 12,
                padding: '8px 10px',
                marginBottom: 10,
              }}
            >
              {isCredit
                ? `Full ${net.toFixed(2)} will be added to customer's A/R.`
                : `${receivable.toFixed(2)} will be added to customer's A/R.`}
            </div>
          )}

          <label>Customer</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">— Walk-in —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              title="Add new customer"
              onClick={() => setShowCustomerModal(true)}
              style={{ padding: '8px 10px' }}
            >
              <Icon name="plus" size={16} />
            </button>
          </div>

          <label style={{ marginTop: 10 }}>Payment method</label>
          <div className="pay-buttons">
            {['CASH', 'CARD', 'BANK', 'CREDIT'].map((m) => (
              <button
                key={m}
                className={`btn ${paymentMethod === m ? 'btn-primary' : ''}`}
                onClick={() => setPaymentMethod(m)}
                type="button"
              >
                {m}
              </button>
            ))}
          </div>

          {!isCredit && (
            <>
              <label style={{ marginTop: 10 }}>
                {paymentMethod === 'CASH' ? 'Cash drawer' : 'Deposit to'}
              </label>
              {eligibleAccounts.length === 0 ? (
                <div
                  className="muted"
                  style={{ fontSize: 12, padding: '6px 0' }}
                >
                  No {paymentMethod === 'CASH' ? 'cash' : 'bank / wallet'}{' '}
                  account configured. Add one under Master Data → Bank /
                  Wallet.
                </div>
              ) : (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">— Select account —</option>
                  {eligibleAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.bank ? ` · ${a.bank}` : ''} ({a.type})
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {checkoutError && <div className="alert alert-error">{checkoutError}</div>}

          <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
            <button className="btn btn-danger" onClick={clearCart} disabled={busy || cart.length === 0}>
              Clear
            </button>
            <button
              className="btn btn-primary"
              onClick={checkout}
              disabled={busy || cart.length === 0}
              style={{ flex: 1 }}
            >
              {busy ? 'Saving…' : `Checkout · ${net.toFixed(2)}`}
            </button>
          </div>
        </aside>
      </div>

      {showCustomerModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCustomerModal(false);
          }}
        >
          <form className="modal" onSubmit={submitNewCustomer}>
            <h3 style={{ marginTop: 0 }}>New Customer</h3>
            {newCustomerError && (
              <div className="alert alert-error">{newCustomerError}</div>
            )}
            <div className="form-row">
              <div>
                <label>Name *</label>
                <input
                  autoFocus
                  required
                  value={newCustomer.name}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label>Phone</label>
                <input
                  value={newCustomer.phone}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, phone: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Email</label>
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, email: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <label>Address</label>
              <textarea
                value={newCustomer.address}
                onChange={(e) =>
                  setNewCustomer({ ...newCustomer, address: e.target.value })
                }
              />
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setShowCustomerModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={newCustomerBusy}>
                {newCustomerBusy ? 'Saving…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
