import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';

export default function POS() {
  const [session, setSession] = useState(null);
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [stores, setStores] = useState([]);
  const [openingFloat, setOpeningFloat] = useState('');

  const [code, setCode] = useState('');
  const [scanError, setScanError] = useState(null);

  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [discount, setDiscount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [checkoutError, setCheckoutError] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  const [busy, setBusy] = useState(false);

  const scanInputRef = useRef(null);

  const loadCart = useCallback(async (sessionId) => {
    const r = await api.get(`/pos/sessions/${sessionId}/cart`);
    setCart(r.data);
  }, []);

  // Bootstrap: fetch active session, customers, stores
  useEffect(() => {
    (async () => {
      try {
        const [active, cust, str] = await Promise.all([
          api.get('/pos/sessions/active'),
          api.get('/customers'),
          api.get('/stores'),
        ]);
        setCustomers(cust.data);
        setStores(str.data);
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
  const paid = Number(paidAmount || 0);
  const change = paid - net;

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
    setBusy(true);
    setCheckoutError(null);
    try {
      const r = await api.post(`/pos/sessions/${session.id}/checkout`, {
        paymentMethod,
        customerId: customerId || undefined,
        discount: disc,
        paidAmount: paidAmount === '' ? undefined : paid,
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
          <form onSubmit={onScanSubmit} className="card pos-scan">
            <label>Scan barcode or type SKU and press Enter</label>
            <input
              ref={scanInputRef}
              autoFocus
              value={code}
              placeholder="e.g. 1234567890123 or PHN-001"
              onChange={(e) => setCode(e.target.value)}
            />
            {scanError && <div className="alert alert-error">{scanError}</div>}
          </form>

          {cart.length === 0 ? (
            <div className="card muted center">Cart is empty. Scan or type a code above.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU</th>
                  <th className="right">Qty</th>
                  <th className="right">Price</th>
                  <th className="right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((ln) => (
                  <tr key={ln.id}>
                    <td>{ln.item?.name ?? ln.itemId}</td>
                    <td>
                      {ln.item?.sku}
                      {ln.item?.barcode && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {ln.item.barcode}
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
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder={net.toFixed(2)}
              />
            </div>
            <div className="net">
              <span>{change >= 0 ? 'Change' : 'Due'}</span>
              <span>{Math.abs(change).toFixed(2)}</span>
            </div>
          </div>

          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— Walk-in —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

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
    </>
  );
}
