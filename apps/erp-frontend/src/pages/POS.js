import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';
import Icon from '../components/Icon';

/**
 * Keyboard shortcuts wired into the POS shell:
 *   F2  → focus the scan input (jump back to scanning without using the mouse)
 *   F4  → focus the customer picker
 *   F8  → trigger checkout
 *   F9  → clear cart (with confirm)
 * Reduces mouse trips during a busy till session.
 */
function usePosShortcuts({ scanInputRef, onClearCart, onCheckout }) {
  useEffect(() => {
    const handler = (e) => {
      // F-keys are unmodified by convention; any modifier means the user is
      // doing something else (Alt+F8, Ctrl+F4, etc.) so we bail out.
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'F2') {
        e.preventDefault();
        scanInputRef.current?.focus();
        scanInputRef.current?.select?.();
      } else if (e.key === 'F4') {
        e.preventDefault();
        const sel = document.querySelector(
          'aside.pos-summary select[aria-label="Customer"], aside.pos-summary select',
        );
        sel?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        onCheckout?.();
      } else if (e.key === 'F9') {
        e.preventDefault();
        onClearCart?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scanInputRef, onClearCart, onCheckout]);
}

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
  // Promise-to-pay date for credit/partial sales. Backend persists it as
  // sales.expected_payment_date and the A/R aging report flags it.
  const [expectedPaymentDate, setExpectedPaymentDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [discount, setDiscount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  // Per-cart-line serials. Keyed by cart-line id; value is a comma/newline
  // separated string entered by the salesman. Only applies to tracksSerials
  // items — split + validated against line.quantity at checkout time.
  const [lineSerials, setLineSerials] = useState({});
  // Per-item incentive credit map: itemId -> { perUnitCredit, targetName, … }.
  // When net-sold qty crosses the target's threshold, the per-unit credit
  // softens the "selling below cost" warning and shows on the cart row.
  const [costAdjustments, setCostAdjustments] = useState({});
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
        const [active, cust, str, acct, costAdj] = await Promise.all([
          api.get('/pos/sessions/active'),
          api.get('/customers'),
          api.get('/stores'),
          api.get('/accounts'),
          api.get('/incentives/cost-adjustments').catch(() => ({
            data: { items: {} },
          })),
        ]);
        setCustomers(cust.data);
        setStores(str.data);
        setAccounts(acct.data);
        setCostAdjustments(costAdj.data?.items ?? {});
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

  /**
   * "+ Generate & Print Local ID" — mints N serials for an unbranded
   * tracksSerials item, injects them into the line's serial textarea, then
   * opens one print-label tab per serial. The backend rejects if the
   * item's category has no Code set.
   */
  const generateLocalSerials = async (line) => {
    try {
      const r = await api.post('/item-serials/generate-local', {
        itemId: line.itemId,
        count: line.quantity,
      });
      const newSerials = (r.data ?? []).map((s) => s.serial);
      if (newSerials.length === 0) return;
      // Append to whatever the cashier had already typed, newline-separated.
      setLineSerials((prev) => {
        const existing = (prev[line.id] ?? '').trim();
        const merged = existing
          ? existing + '\n' + newSerials.join('\n')
          : newSerials.join('\n');
        return { ...prev, [line.id]: merged };
      });
      // Spawn label print tabs — one per serial. Most browsers will batch
      // these into a popup-block if there are too many; the cashier can
      // re-trigger from the Items hub if needed.
      for (const s of newSerials.slice(0, 5)) {
        window.open(`#/print/serial-label/${encodeURIComponent(s)}`, '_blank');
      }
    } catch (err) {
      alert(err.uiMessage ?? 'Local serial mint failed');
    }
  };

  // Keyboard shortcuts: F2 scan, F4 customer, F8 checkout, F9 clear cart.
  usePosShortcuts({
    scanInputRef,
    onClearCart: () => clearCart(),
    onCheckout: () => {
      // Click the actual checkout button so we go through whatever guards
      // the form has (busy-state, validation messages).
      const btn = document.querySelector(
        'aside.pos-summary button[type="submit"], aside.pos-summary .btn-primary',
      );
      if (btn instanceof HTMLButtonElement && !btn.disabled) btn.click();
    },
  });

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
      const willHaveReceivable = isCredit || (paidAmount !== '' && paid < net);

      // Collect serials per (unique) itemId. Cart aggregates qty per item, so
      // we union the strings and split on newlines/commas. Client-side gate
      // mirrors the backend: strict for `serialRequiredOnSale`, optional but
      // all-or-nothing otherwise. The server still has the final say.
      const serialsByItem = new Map();
      for (const ln of cart) {
        if (!ln.item?.tracksSerials) continue;
        const raw = lineSerials[ln.id] ?? '';
        const list = raw
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (ln.item.serialRequiredOnSale && list.length !== ln.quantity) {
          setCheckoutError(
            `${ln.item.name}: ${ln.quantity} serial number${ln.quantity === 1 ? '' : 's'} required (got ${list.length}).`,
          );
          setBusy(false);
          return;
        }
        if (
          !ln.item.serialRequiredOnSale &&
          list.length > 0 &&
          list.length !== ln.quantity
        ) {
          setCheckoutError(
            `${ln.item.name}: either ${ln.quantity} serial${ln.quantity === 1 ? '' : 's'} or none.`,
          );
          setBusy(false);
          return;
        }
        if (list.length === 0) continue;
        const existing = serialsByItem.get(ln.itemId) ?? [];
        serialsByItem.set(ln.itemId, [...existing, ...list]);
      }
      const serialsPayload = Array.from(serialsByItem.entries()).map(
        ([itemId, serials]) => ({ itemId, serials }),
      );

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
        expectedPaymentDate:
          willHaveReceivable && expectedPaymentDate
            ? expectedPaymentDate
            : undefined,
        serials: serialsPayload.length > 0 ? serialsPayload : undefined,
      });
      setLastSale(r.data);
      setCart([]);
      setLineSerials({});
      setDiscount('');
      setPaidAmount('');
      setCustomerId('');
      setExpectedPaymentDate('');
      // refresh session totals
      const refreshed = await api.get(`/pos/sessions/${session.id}`);
      setSession(refreshed.data);
      // refresh incentive credits — this sale may have just pushed a target
      // over its threshold, unlocking a new effective-cost discount.
      api
        .get('/incentives/cost-adjustments')
        .then((r) => setCostAdjustments(r.data?.items ?? {}))
        .catch(() => {});
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
          {Number(lastSale.dueAmount) > 0 && (
            <>
              {' '}· <strong>BOOKING HOLD</strong> — balance pending Rs{' '}
              {Number(lastSale.dueAmount).toFixed(2)}
            </>
          )}
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
          {Number(lastSale.dueAmount) > 0 && (
            <>
              {' · '}
              <a
                href={`#/print/booking-receipt/${lastSale.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Print booking hold slip
              </a>
              {' · '}
              <a
                href={`#/print/box-tag/${lastSale.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Print box tag
              </a>
            </>
          )}
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
                {cart.map((ln) => {
                  const showSerialBox = ln.item?.tracksSerials !== false;
                  const required =
                    showSerialBox && ln.item?.serialRequiredOnSale !== false;
                  const raw = lineSerials[ln.id] ?? '';
                  const enteredCount = raw
                    .split(/[\n,]+/)
                    .map((s) => s.trim())
                    .filter(Boolean).length;
                  const serialsOk = required
                    ? enteredCount === ln.quantity
                    : enteredCount === 0 || enteredCount === ln.quantity;
                  // Effective cost = avgCost minus any incentive credit
                  // unlocked by an active+triggered manufacturer target.
                  const avgCost = Number(ln.item?.avgCost ?? 0);
                  const credit = costAdjustments[ln.itemId];
                  const perUnitCredit = credit?.perUnitCredit ?? 0;
                  const effectiveCost = Math.max(0, avgCost - perUnitCredit);
                  const unitPrice = Number(ln.price);
                  const belowEffectiveCost =
                    avgCost > 0 && unitPrice < effectiveCost;
                  const belowRawCost =
                    avgCost > 0 && unitPrice < avgCost && !belowEffectiveCost;
                  return (
                  <Fragment key={ln.id}>
                  <tr>
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
                      {credit && (
                        <div
                          className="chip chip-info"
                          style={{
                            fontSize: 10.5,
                            marginTop: 4,
                            display: 'inline-block',
                          }}
                          title={`Target "${credit.targetName}" at ${credit.progressPct.toFixed(0)}% — effective cost Rs ${effectiveCost.toFixed(2)}`}
                        >
                          + Rs {perUnitCredit.toFixed(0)}/unit incentive
                        </div>
                      )}
                      {belowEffectiveCost && (
                        <div
                          className="chip chip-danger"
                          style={{
                            fontSize: 10.5,
                            marginTop: 4,
                            marginLeft: credit ? 4 : 0,
                            display: 'inline-block',
                          }}
                          title={`Below effective cost of Rs ${effectiveCost.toFixed(2)} — this sale will lose money even after the incentive`}
                        >
                          Below cost
                        </div>
                      )}
                      {belowRawCost && (
                        <div
                          className="chip chip-warn"
                          style={{
                            fontSize: 10.5,
                            marginTop: 4,
                            display: 'inline-block',
                          }}
                          title={`Below avg cost Rs ${avgCost.toFixed(2)} — covered by incentive if target lands`}
                        >
                          Below raw cost · incentive covers
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
                  {showSerialBox && (
                    <tr>
                      <td colSpan={5} style={{ paddingTop: 0 }}>
                        <label
                          style={{
                            fontSize: 11,
                            color: serialsOk
                              ? 'var(--success)'
                              : required
                                ? 'var(--warning)'
                                : 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                          }}
                          title={
                            required
                              ? 'Scan or type one serial per unit. Required to check out.'
                              : 'Optional — capture if available. Leave blank otherwise.'
                          }
                        >
                          Serial{ln.quantity === 1 ? '' : 's'} (
                          {enteredCount}/{ln.quantity})
                          {serialsOk
                            ? required
                              ? ' ✓'
                              : enteredCount > 0
                                ? ' ✓'
                                : ' · optional'
                            : required
                              ? ' — required'
                              : ' · need 0 or all'}
                        </label>
                        <textarea
                          rows={Math.min(3, ln.quantity)}
                          value={raw}
                          onChange={(e) =>
                            setLineSerials((prev) => ({
                              ...prev,
                              [ln.id]: e.target.value,
                            }))
                          }
                          placeholder={
                            ln.quantity === 1
                              ? 'Scan or type the appliance serial…'
                              : 'One serial per unit (newline-separated)'
                          }
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                          }}
                        />
                        {ln.item?.isInternalGenerated && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ marginTop: 4 }}
                            onClick={() => generateLocalSerials(ln)}
                            title="Mint LOCAL-{cat}-{year}-{seq} serials for this line and inject them above. Opens print labels in new tabs."
                          >
                            + Generate &amp; Print Local ID
                            {ln.quantity > 1 ? `s (${ln.quantity})` : ''}
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
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
            <>
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
              <label
                style={{ fontSize: 12, marginTop: 0 }}
                title="If the customer promised to pay by a specific date (e.g. 15 days from now), set it here. The A/R aging report flags overdue promises."
              >
                Promise to pay by (optional)
              </label>
              <input
                type="date"
                value={expectedPaymentDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setExpectedPaymentDate(e.target.value)}
                style={{ marginBottom: 10 }}
              />
            </>
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
