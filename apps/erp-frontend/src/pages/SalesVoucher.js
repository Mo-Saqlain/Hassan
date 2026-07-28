import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import EditVoucherBar from '../components/EditVoucherBar';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useUnsavedChangesPrompt } from '../hooks/useUnsavedChangesPrompt';

/**
 * Bill-book style Sales Voucher: customer + lines + N payment splits, all
 * posted atomically through `POST /sales/voucher` (see SalesService.
 * createFromVoucher). The page is intentionally stateless on the server —
 * unlike POS Terminal which keeps a session-scoped cart, this one builds
 * the whole submission client-side and writes it in one shot.
 *
 * Layout follows the hand-drawn wireframe the shop owner sketched:
 *   ┌─ Customer + invoice meta ─────────────────────────┐
 *   ├─ Scan code · Line items (Item · Qty · Unit · Tot) ┤
 *   ├─ Payment splits (Account · Amount · Reference) ───┤
 *   ├─ Deferred schedule (when residual > 0) ───────────┤
 *   │  Net · Paid · Residual footer ─────────────────────┤
 *   └─ Submit · Cancel ─────────────────────────────────┘
 *
 * Keyboard shortcuts:
 *   F2          — focus the scan/barcode input
 *   Ctrl+Enter  — submit the voucher
 *
 * The Submit button is disabled until the lines have a non-zero net AND
 * the splits sum does not exceed the net AND (if scheduling is on) the
 * commitments sum to the residual. The server re-validates everything.
 */
export default function SalesVoucher() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: items } = useResource('/items');
  const { data: customers, reload: reloadCustomers } = useResource(
    '/reports/customer-balances',
  );
  const { data: accounts } = useResource('/accounts');

  const blankLine = () => ({
    itemId: '',
    quantity: 1,
    unitPrice: 0,
    serials: '',
    _key: Math.random().toString(36).slice(2),
  });

  // Parse a free-text serial blob (one per line / whitespace / comma) into
  // a clean array. Used for both the count-validation pass and the payload.
  const parseSerials = (txt) =>
    String(txt ?? '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  const blankSplit = () => ({
    accountId: '',
    // Sentinel handled client-side: 'CASH' (default, uses accountId) or
    // 'CUSTOMER_CREDIT' (applies prior customer credit; no accountId,
    // capped at customer's available credit). When the cashier picks the
    // pseudo-option from the split dropdown we flip kind to CUSTOMER_CREDIT
    // and stop requiring an accountId on that row.
    kind: 'CASH',
    amount: 0,
    reference: '',
    _key: Math.random().toString(36).slice(2),
  });
  const blankCommitment = () => ({
    dueDate: '',
    expectedAmount: 0,
    notes: '',
    _key: Math.random().toString(36).slice(2),
  });

  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [lines, setLines] = useState([blankLine()]);
  const [splits, setSplits] = useState([blankSplit()]);
  const [submitErr, setSubmitErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Scan input — barcode / SKU / model no goes here; Enter resolves the
  // line. Stays in DOM at the top of the items table; F2 focuses it.
  const [scanCode, setScanCode] = useState('');
  const [scanErr, setScanErr] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const scanRef = useRef(null);

  // Deferred schedule: optional, only meaningful when residual > 0. When
  // ON the residual routes to the Deferred Cash Receivables system account
  // and each commitment becomes a row the dashboard can chase.
  const [useSchedule, setUseSchedule] = useState(false);
  const [commitments, setCommitments] = useState([blankCommitment()]);

  // Inline customer create — owner often signs up a new walk-in mid-bill,
  // and bouncing out to the Customers tab loses the in-progress voucher.
  const [showNewCust, setShowNewCust] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', address: '' });
  const [newCustErr, setNewCustErr] = useState(null);
  const [newCustBusy, setNewCustBusy] = useState(false);

  // Pre-pin the cash drawer / on-hand account on the first split so an
  // owner who's doing a quick walk-in voucher only has to type the amount.
  const cashAccount = useMemo(
    () => accounts.find((a) => a.type === 'CASH' || a.type === 'CASH_ON_HAND'),
    [accounts],
  );

  const grossTotal = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + Number(l.unitPrice || 0) * Number(l.quantity || 0),
        0,
      ),
    [lines],
  );
  const netTotal = Math.max(0, Number((grossTotal - (discount || 0)).toFixed(2)));
  const paidTotal = useMemo(
    () => splits.reduce((s, x) => s + Number(x.amount || 0), 0),
    [splits],
  );
  const residual = Number((netTotal - paidTotal).toFixed(2));
  const overSplit = paidTotal > netTotal + 0.005;

  // Available customer credit comes from the per-party balance roll-up:
  // negative balance = customer overpaid in the past → that surplus can
  // settle part of this bill without taking new cash. Walk-ins have no
  // ledger so always 0.
  const availableCredit = useMemo(() => {
    if (!customerId) return 0;
    const c = customers.find((x) => x.id === customerId);
    const bal = c ? Number(c.balance ?? 0) : 0;
    return Math.max(0, -bal);
  }, [customerId, customers]);
  const ccSplitTotal = useMemo(
    () =>
      splits
        .filter((s) => s.kind === 'CUSTOMER_CREDIT')
        .reduce((s, x) => s + Number(x.amount || 0), 0),
    [splits],
  );
  const ccOverApplied = ccSplitTotal > availableCredit + 0.005;

  const scheduleTotal = useMemo(
    () => commitments.reduce((s, c) => s + Number(c.expectedAmount || 0), 0),
    [commitments],
  );
  // The schedule must clear the residual exactly when it's on — half a
  // schedule is worse than no schedule (the dashboard would chase the
  // wrong amount and the rest would hide in plain A/R).
  const scheduleMismatch =
    useSchedule && residual > 0
      ? Math.abs(scheduleTotal - residual) > 0.005
      : false;
  const scheduleBadRow =
    useSchedule &&
    residual > 0 &&
    commitments.some(
      (c) =>
        Number(c.expectedAmount || 0) > 0 &&
        (!c.dueDate || isNaN(new Date(c.dueDate).getTime())),
    );

  // Per-line serial check: when the picked item has tracksSerials=true,
  // the count of parsed serials must match the row quantity (or, for
  // serialRequiredOnSale=false, be 0 — cashier explicitly skipped it).
  const lineSerialOk = (l) => {
    const it = items.find((x) => x.id === l.itemId);
    if (!it || !it.tracksSerials) return true;
    const parsed = parseSerials(l.serials);
    const qty = Number(l.quantity || 0);
    if (it.serialRequiredOnSale) return parsed.length === qty;
    return parsed.length === 0 || parsed.length === qty;
  };

  // Compile every gate that's still blocking save into a single user-facing
  // list. The disabled Save button is silent on its own — surfacing the
  // specific reason next to the button means the cashier never has to guess
  // "why isn't this saving?". Order matches the natural top-to-bottom scan
  // of the screen so the first item in the list is the highest one in view.
  const blockReasons = [];
  if (netTotal <= 0) {
    blockReasons.push('Add at least one line with a price.');
  } else {
    lines.forEach((l, idx) => {
      if (!l.itemId)
        blockReasons.push(`Line ${idx + 1}: pick an item.`);
      else if (!(Number(l.quantity) > 0))
        blockReasons.push(`Line ${idx + 1}: quantity must be > 0.`);
      else if (Number(l.unitPrice) < 0)
        blockReasons.push(`Line ${idx + 1}: unit price can't be negative.`);
      else if (!lineSerialOk(l)) {
        const it = items.find((x) => x.id === l.itemId);
        const parsed = parseSerials(l.serials).length;
        const q = Number(l.quantity || 0);
        if (it?.serialRequiredOnSale) {
          blockReasons.push(
            `Line ${idx + 1} (${it.name}): needs ${q} serial${q === 1 ? '' : 's'} (got ${parsed}). Type or scan one per unit in the box below the row, or turn off "serial required" on the item.`,
          );
        } else {
          blockReasons.push(
            `Line ${idx + 1} (${it?.name ?? 'item'}): either ${q} serial${q === 1 ? '' : 's'} (one per unit) or none — got ${parsed}.`,
          );
        }
      }
    });
  }
  if (overSplit)
    blockReasons.push(
      `Splits exceed the net by ${(paidTotal - netTotal).toFixed(2)}.`,
    );
  splits.forEach((sp, idx) => {
    const amt = Number(sp.amount || 0);
    if (amt > 0 && sp.kind !== 'CUSTOMER_CREDIT' && !sp.accountId) {
      blockReasons.push(`Split ${idx + 1}: pick a destination account.`);
    }
  });
  if (ccOverApplied)
    blockReasons.push(
      `Customer credit applied (${ccSplitTotal.toFixed(2)}) exceeds available (${availableCredit.toFixed(2)}).`,
    );
  if (ccSplitTotal > 0 && !customerId)
    blockReasons.push('Pick a customer to apply customer credit.');
  if (scheduleMismatch)
    blockReasons.push(
      `Schedule total (${scheduleTotal.toFixed(2)}) must equal the residual (${residual.toFixed(2)}) — off by ${(scheduleTotal - residual).toFixed(2)}.`,
    );
  if (scheduleBadRow)
    blockReasons.push(
      'Every scheduled row with an amount needs a due date.',
    );

  const canSubmit = !submitting && blockReasons.length === 0;

  const isDirty =
    netTotal > 0 ||
    customerId !== '' ||
    notes.trim() !== '' ||
    lines.some((l) => l.itemId) ||
    splits.some((sp) => Number(sp.amount || 0) > 0) ||
    useSchedule;
  useUnsavedChangesPrompt(isDirty);

  // F2 = focus scan, Ctrl+Enter = submit. Registered at the document level
  // so it works while the cashier is typing in any input within the form.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        scanRef.current?.focus();
        scanRef.current?.select();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // Click the submit button rather than reproducing the submit logic
        // — keeps the disabled-state and form-validity check honest.
        document
          .querySelector('form .btn.btn-primary[type="submit"]')
          ?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const updateLine = (key, patch) => {
    setLines((prev) =>
      prev.map((l) => (l._key === key ? { ...l, ...patch } : l)),
    );
  };

  // Pulling default sale price the moment the cashier picks an item means
  // the row is usable without typing — they only override the price when
  // there's a relationship discount in play.
  const pickItem = (key, itemId) => {
    const it = items.find((i) => i.id === itemId);
    updateLine(key, {
      itemId,
      unitPrice: it ? Number(it.salePrice ?? 0) : 0,
    });
  };

  const addLine = () => setLines((prev) => [...prev, blankLine()]);
  const removeLine = (key) =>
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((l) => l._key !== key),
    );

  const updateSplit = (key, patch) => {
    setSplits((prev) =>
      prev.map((s) => (s._key === key ? { ...s, ...patch } : s)),
    );
  };
  const addSplit = () => setSplits((prev) => [...prev, blankSplit()]);
  const removeSplit = (key) =>
    setSplits((prev) =>
      prev.length === 1 ? prev : prev.filter((s) => s._key !== key),
    );

  const updateCommitment = (key, patch) =>
    setCommitments((prev) =>
      prev.map((c) => (c._key === key ? { ...c, ...patch } : c)),
    );
  const addCommitment = () =>
    setCommitments((prev) => [...prev, blankCommitment()]);
  const removeCommitment = (key) =>
    setCommitments((prev) =>
      prev.length === 1 ? prev : prev.filter((c) => c._key !== key),
    );

  /**
   * Scan-to-add: looks up an exact match by barcode / SKU / model no via
   * `GET /items/lookup?code=X`. If the resolved item is already on a
   * blank-priced row in the table we stack quantity (typical scan twice =
   * qty 2). Otherwise we add a new row pre-filled at the item's sale
   * price. The scan input stays focused after every successful add so a
   * cashier with a wedge scanner can rip through a basket without
   * reaching for the mouse.
   */
  const onScan = async (e) => {
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    setScanErr(null);
    setScanBusy(true);
    try {
      const r = await api.get(
        `/items/lookup?code=${encodeURIComponent(code)}`,
      );
      const item = r.data;
      if (!item?.id) {
        setScanErr(`No item matches "${code}".`);
        return;
      }
      setLines((prev) => {
        // Stack on the first existing line for this item that's still at
        // the item's default sale price (i.e. nobody has overridden it
        // mid-bill). Bumps qty by 1. If none qualifies, append a new row.
        const stackable = prev.find(
          (l) =>
            l.itemId === item.id &&
            Number(l.unitPrice) === Number(item.salePrice ?? 0),
        );
        if (stackable) {
          return prev.map((l) =>
            l._key === stackable._key
              ? { ...l, quantity: Number(l.quantity || 0) + 1 }
              : l,
          );
        }
        const blankFirst =
          prev.length === 1 && prev[0].itemId === '' ? prev[0] : null;
        const newRow = {
          ...blankLine(),
          itemId: item.id,
          quantity: 1,
          unitPrice: Number(item.salePrice ?? 0),
        };
        if (blankFirst) {
          return [{ ...blankFirst, ...newRow, _key: blankFirst._key }];
        }
        return [...prev, newRow];
      });
      setScanCode('');
      // Keep the scanner in focus — cashiers expect F2-like persistence.
      requestAnimationFrame(() => scanRef.current?.focus());
    } catch (err) {
      setScanErr(err.uiMessage ?? 'Lookup failed');
    } finally {
      setScanBusy(false);
    }
  };

  /**
   * Inline customer create. Stays on the voucher screen — POSTs to
   * /customers, refreshes the customer balance list, then auto-selects
   * the new id. New customers default to creditEnabled=false; the
   * Customers tab is still the place to flip credit on with a limit.
   */
  const createCustomer = async (e) => {
    e.preventDefault();
    const name = newCust.name.trim();
    if (!name) {
      setNewCustErr('Name is required.');
      return;
    }
    setNewCustErr(null);
    setNewCustBusy(true);
    try {
      const r = await api.post('/customers', {
        name,
        phone: newCust.phone.trim() || undefined,
        address: newCust.address.trim() || undefined,
      });
      const created = r.data;
      await reloadCustomers();
      if (created?.id) setCustomerId(created.id);
      setShowNewCust(false);
      setNewCust({ name: '', phone: '', address: '' });
    } catch (err) {
      setNewCustErr(err.uiMessage ?? 'Could not create customer');
    } finally {
      setNewCustBusy(false);
    }
  };

  const reset = () => {
    setCustomerId('');
    setNotes('');
    setDiscount(0);
    setLines([blankLine()]);
    setSplits([blankSplit()]);
    setUseSchedule(false);
    setCommitments([blankCommitment()]);
    setScanCode('');
    setScanErr(null);
    setSubmitErr(null);
  };

  /**
   * Correction mode. `?edit=<saleId>` loads that invoice into this form; saving
   * PATCHes it instead of creating a new one, so it keeps its invoice number and
   * its receipts are re-issued together with it.
   *
   * The voucher screen is the only place a sale's shape is expressed — lines,
   * splits, commitments — so corrections belong here rather than in a second form
   * bolted onto the read-only history page.
   */
  const editId = searchParams.get('edit');
  const [editing, setEditing] = useState(null);
  const [editReason, setEditReason] = useState('');
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    api
      .get(`/sales/${editId}`)
      .then((r) => {
        if (cancelled) return;
        const sale = r.data;
        setEditing(sale);
        setCustomerId(sale.customerId ?? '');
        setNotes(sale.notes ?? '');
        setDiscount(Number(sale.discount ?? 0));
        setLines(
          (sale.lines ?? []).map((ln) => ({
            ...blankLine(),
            itemId: ln.itemId,
            quantity: String(ln.quantity),
            unitPrice: String(ln.unitPrice),
            // Serials are re-bound from what's typed; the originals are unbound
            // server-side, so pre-filling would risk double-binding.
            serials: '',
          })),
        );
        // Rebuild the splits from the receipts this voucher raised. Money
        // already collected has to appear here or saving would look like the
        // customer never paid.
        const paid = Number(sale.paidAmount ?? 0);
        setSplits(
          paid > 0
            ? [{ ...blankSplit(), amount: String(paid), kind: 'CASH', accountId: '' }]
            : [blankSplit()],
        );
        const sched = sale.paymentCommitments ?? [];
        if (sched.length > 0) {
          setUseSchedule(true);
          setCommitments(
            sched.map((c) => ({
              ...blankCommitment(),
              dueDate: (c.dueDate ?? '').slice(0, 10),
              expectedAmount: String(c.expectedAmount ?? ''),
              notes: c.notes ?? '',
            })),
          );
        }
      })
      .catch((err) =>
        setLoadErr(err.uiMessage ?? 'Could not load that invoice for editing.'),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitErr(null);
    setSubmitting(true);
    try {
      const payload = {
        customerId: customerId || undefined,
        discount: Number(discount) || 0,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => {
          const parsed = parseSerials(l.serials);
          return {
            itemId: l.itemId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            ...(parsed.length > 0 ? { serials: parsed } : {}),
          };
        }),
        splits: splits
          .filter((sp) => Number(sp.amount || 0) > 0)
          .map((sp) => {
            if (sp.kind === 'CUSTOMER_CREDIT') {
              return {
                kind: 'CUSTOMER_CREDIT',
                amount: Number(sp.amount),
                reference: sp.reference.trim() || undefined,
              };
            }
            return {
              kind: 'CASH',
              accountId: sp.accountId,
              amount: Number(sp.amount),
              reference: sp.reference.trim() || undefined,
            };
          }),
      };
      if (useSchedule && residual > 0) {
        payload.paymentCommitments = commitments
          .filter((c) => Number(c.expectedAmount || 0) > 0 && c.dueDate)
          .map((c) => ({
            dueDate: c.dueDate,
            expectedAmount: Number(c.expectedAmount),
            notes: c.notes.trim() || undefined,
          }));
      }
      const r = editing
        ? await api.patch(`/sales/voucher/${editing.id}`, {
            ...payload,
            reason: editReason,
          })
        : await api.post('/sales/voucher', payload);
      const saleId = r.data?.sale?.id;
      const invoiceNo = r.data?.sale?.invoiceNo;
      reset();
      if (saleId) {
        // Open the printable invoice straight away. The shop owner's
        // expectation from the wireframe was: Submit → bill prints.
        window.open(`#/print/sale/${saleId}`, '_blank');
      }
      // Drop the cashier on Sales history so they see the row they just
      // wrote — with the new invoice highlighted by the URL fragment.
      navigate(`/sales${invoiceNo ? `#${invoiceNo}` : ''}`);
    } catch (err) {
      setSubmitErr(err.uiMessage ?? 'Voucher save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const customerBalance = useMemo(() => {
    if (!customerId) return null;
    const c = customers.find((x) => x.id === customerId);
    return c ? Number(c.balance ?? 0) : null;
  }, [customerId, customers]);

  return (
    <form className="card" onSubmit={submit}>
      <div className="page-header" style={{ margin: 0 }}>
        <h2 style={{ margin: 0 }}>
          {editing ? `Correct ${editing.invoiceNo}` : 'Sales Voucher'}
        </h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {editing
            ? 'Correcting a posted invoice · same number · receipts re-issued'
            : 'Bill-book entry · multi-tender · atomic'}
        </span>
      </div>

      {loadErr && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          {loadErr}
        </div>
      )}

      {editing && (
        <div style={{ marginTop: 12 }}>
          <EditVoucherBar
            label={editing.invoiceNo}
            reason={editReason}
            onReason={setEditReason}
            onCancel={() => navigate('/sales')}
            editCount={Number(editing.editCount ?? 0)}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>
            Re-enter serials for any tracked line — the originals are released
            when the invoice is re-posted. Payment splits have been rebuilt from
            the amount collected; pick the account each part landed in.
          </div>
        </div>
      )}

      {submitErr && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          {submitErr}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: 14 }}>
        <div
          className="eyebrow"
          style={{
            marginBottom: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <span>Customer</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowNewCust((v) => !v)}
          >
            {showNewCust ? 'Close' : '+ New customer'}
          </button>
        </div>

        {showNewCust && (
          <div
            className="card"
            style={{
              padding: 10,
              marginBottom: 10,
              background: 'var(--surface-2, transparent)',
            }}
          >
            {newCustErr && (
              <div className="alert alert-error" style={{ marginBottom: 8 }}>
                {newCustErr}
              </div>
            )}
            <div className="form-row">
              <div>
                <label>Name *</label>
                <input
                  autoFocus
                  value={newCust.name}
                  onChange={(e) =>
                    setNewCust((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <label>Phone</label>
                <input
                  value={newCust.phone}
                  onChange={(e) =>
                    setNewCust((p) => ({ ...p, phone: e.target.value }))
                  }
                />
              </div>
              <div>
                <label>Address</label>
                <input
                  value={newCust.address}
                  onChange={(e) =>
                    setNewCust((p) => ({ ...p, address: e.target.value }))
                  }
                />
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={createCustomer}
                disabled={newCustBusy || !newCust.name.trim()}
              >
                {newCustBusy ? 'Saving…' : 'Save & select'}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setShowNewCust(false);
                  setNewCust({ name: '', phone: '', address: '' });
                  setNewCustErr(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="form-row">
          <div>
            <label>Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Walk-in</option>
              {customers.map((c) => {
                const bal = Number(c.balance ?? 0);
                const tail =
                  bal === 0
                    ? ''
                    : bal > 0
                    ? ` — owes ${bal.toFixed(2)}`
                    : ` — credit ${Math.abs(bal).toFixed(2)}`;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {tail}
                  </option>
                );
              })}
            </select>
            {customerBalance !== null && customerBalance !== 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {customerBalance > 0
                  ? `Open A/R balance: ${customerBalance.toFixed(2)}`
                  : `Customer holds credit: ${Math.abs(customerBalance).toFixed(
                      2,
                    )}`}
              </div>
            )}
          </div>
          <div>
            <label>Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reference / remarks (optional)"
            />
          </div>
        </div>
      </section>

      {/* ── Line items ───────────────────────────────────────────────── */}
      <section style={{ marginTop: 18 }}>
        <div
          className="eyebrow"
          style={{
            marginBottom: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <span>Items</span>
          <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
            Press F2 to focus the scanner · Ctrl+Enter to submit
          </span>
        </div>

        {/* Barcode / SKU scan input. Posts to /items/lookup, stacks qty on
            a matching row, otherwise adds a new line. */}
        <div style={{ marginBottom: 10 }}>
          <input
            ref={scanRef}
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onScan(e);
            }}
            placeholder="Scan barcode or type SKU / model no, then Enter"
            disabled={scanBusy}
            style={{
              width: '100%',
              maxWidth: 460,
              fontFamily: 'Cascadia Code, Consolas, monospace',
            }}
          />
          {scanErr && (
            <div
              className="muted"
              style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}
            >
              {scanErr}
            </div>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '45%' }}>Item</th>
              <th className="right" style={{ width: 100 }}>
                Qty
              </th>
              <th className="right" style={{ width: 140 }}>
                Unit price
              </th>
              <th className="right" style={{ width: 140 }}>
                Line total
              </th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const lineTotal =
                Number(line.unitPrice || 0) * Number(line.quantity || 0);
              const lineItem = items.find((x) => x.id === line.itemId);
              const tracked = !!lineItem?.tracksSerials;
              const parsedCount = parseSerials(line.serials).length;
              const qty = Number(line.quantity || 0);
              const required =
                tracked &&
                lineItem?.serialRequiredOnSale &&
                parsedCount !== qty;
              const optionalBadCount =
                tracked &&
                !lineItem?.serialRequiredOnSale &&
                parsedCount > 0 &&
                parsedCount !== qty;
              return (
                <Fragment key={line._key}>
                <tr>
                  <td>
                    <select
                      value={line.itemId}
                      onChange={(e) => pickItem(line._key, e.target.value)}
                    >
                      <option value="">— Pick item —</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="right"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line._key, {
                          quantity: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="right"
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(line._key, {
                          unitPrice:
                            e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {lineTotal.toFixed(2)}
                  </td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => removeLine(line._key)}
                      disabled={lines.length === 1}
                      title={
                        lines.length === 1
                          ? 'Need at least one line'
                          : 'Remove this line'
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
                {tracked && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        background: 'var(--surface-2, transparent)',
                        paddingTop: 4,
                        paddingBottom: 8,
                      }}
                    >
                      <label
                        style={{
                          display: 'block',
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color:
                            required || optionalBadCount
                              ? 'var(--danger)'
                              : 'var(--text-muted)',
                          marginBottom: 4,
                        }}
                      >
                        Serials · one per unit ({parsedCount}/{qty})
                        {lineItem?.serialRequiredOnSale
                          ? ' · required'
                          : ' · optional'}
                      </label>
                      <textarea
                        rows={Math.min(4, Math.max(1, qty))}
                        value={line.serials}
                        onChange={(e) =>
                          updateLine(line._key, { serials: e.target.value })
                        }
                        placeholder="Scan or paste one serial per line"
                        style={{
                          width: '100%',
                          fontFamily: 'Cascadia Code, Consolas, monospace',
                        }}
                      />
                      {(required || optionalBadCount) && (
                        <div
                          className="muted"
                          style={{
                            fontSize: 12,
                            color: 'var(--danger)',
                            marginTop: 4,
                          }}
                        >
                          {required
                            ? `${qty} serial${qty === 1 ? '' : 's'} required for this item.`
                            : `Either ${qty} serial${qty === 1 ? '' : 's'} (one per unit) or leave the box empty — no half-rows.`}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" onClick={addLine}>
            + Add item
          </button>
        </div>
      </section>

      {/* ── Discount + net summary ───────────────────────────────────── */}
      <section style={{ marginTop: 18 }}>
        <div className="form-row">
          <div>
            <label>Discount on bill</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="right"
              value={discount}
              onChange={(e) =>
                setDiscount(e.target.value === '' ? 0 : Number(e.target.value))
              }
            />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Gross
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18 }}>
              {grossTotal.toFixed(2)}
            </div>
          </div>
          <div style={{ alignSelf: 'end' }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Net
            </div>
            <div
              style={{
                fontVariantNumeric: 'tabular-nums',
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              {netTotal.toFixed(2)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Payment splits ───────────────────────────────────────────── */}
      <section style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Payment splits
          <span
            className="muted"
            style={{ fontWeight: 400, marginLeft: 8, fontSize: 11 }}
          >
            (cash, bank, wallet — any combination; residual posts to A/R)
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '35%' }}>Account</th>
              <th className="right" style={{ width: 160 }}>
                Amount
              </th>
              <th>Reference</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {splits.map((split, idx) => {
              // Combined value handles three states in one <select>:
              //   ''                       → blank (default pick)
              //   '__CUSTOMER_CREDIT__'    → kind=CUSTOMER_CREDIT row
              //   <uuid>                   → kind=CASH, accountId=<uuid>
              const dropdownValue =
                split.kind === 'CUSTOMER_CREDIT'
                  ? '__CUSTOMER_CREDIT__'
                  : split.accountId;
              return (
              <tr key={split._key}>
                <td>
                  <select
                    value={dropdownValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__CUSTOMER_CREDIT__') {
                        updateSplit(split._key, {
                          kind: 'CUSTOMER_CREDIT',
                          accountId: '',
                        });
                      } else {
                        updateSplit(split._key, {
                          kind: 'CASH',
                          accountId: v,
                        });
                      }
                    }}
                  >
                    <option value="">
                      {idx === 0 && cashAccount ? cashAccount.name : '— Pick account —'}
                    </option>
                    {availableCredit > 0 && (
                      <option value="__CUSTOMER_CREDIT__">
                        Customer credit · available {availableCredit.toFixed(2)}
                      </option>
                    )}
                    {accounts
                      .filter((a) =>
                        ['CASH', 'BANK', 'WALLET', 'CASH_ON_HAND'].includes(a.type),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type})
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="right"
                    value={split.amount}
                    onChange={(e) =>
                      updateSplit(split._key, {
                        amount: e.target.value === '' ? 0 : Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    value={split.reference}
                    onChange={(e) =>
                      updateSplit(split._key, { reference: e.target.value })
                    }
                    placeholder='e.g. "Cheque 12345", "JazzCash 9F2K"'
                  />
                </td>
                <td className="right">
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => removeSplit(split._key)}
                    disabled={splits.length === 1}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
        {ccOverApplied && (
          <div className="alert alert-error" style={{ marginTop: 8 }}>
            Customer credit applied ({ccSplitTotal.toFixed(2)}) exceeds the
            available credit ({availableCredit.toFixed(2)}). Reduce the
            credit split or top it up with a cash split.
          </div>
        )}
        {ccSplitTotal > 0 && !customerId && (
          <div className="alert alert-error" style={{ marginTop: 8 }}>
            Pick a customer above before applying customer credit.
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" onClick={addSplit}>
            + Add split
          </button>
        </div>
      </section>

      {/* ── Deferred-cash schedule (only when there's a residual) ────── */}
      {residual > 0 && (
        <section style={{ marginTop: 18 }}>
          <div
            className="eyebrow"
            style={{
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontWeight: 400,
            }}
          >
            <input
              id="use-schedule-toggle"
              type="checkbox"
              checked={useSchedule}
              onChange={(e) => setUseSchedule(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <label
              htmlFor="use-schedule-toggle"
              style={{
                margin: 0,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: 12,
              }}
            >
              Schedule remaining {residual.toFixed(2)} as deferred cash
            </label>
            <span className="muted" style={{ fontSize: 11 }}>
              (routes residual to Deferred Cash Receivables · dashboard chases each due date)
            </span>
          </div>

          {useSchedule && (
            <>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 180 }}>Due date</th>
                    <th className="right" style={{ width: 160 }}>
                      Expected amount
                    </th>
                    <th>Notes</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {commitments.map((c) => (
                    <tr key={c._key}>
                      <td>
                        <input
                          type="date"
                          value={c.dueDate}
                          onChange={(e) =>
                            updateCommitment(c._key, { dueDate: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="right"
                          value={c.expectedAmount}
                          onChange={(e) =>
                            updateCommitment(c._key, {
                              expectedAmount:
                                e.target.value === ''
                                  ? 0
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={c.notes}
                          onChange={(e) =>
                            updateCommitment(c._key, { notes: e.target.value })
                          }
                          placeholder='e.g. "Pay half on the 20th"'
                        />
                      </td>
                      <td className="right">
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => removeCommitment(c._key)}
                          disabled={commitments.length === 1}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={addCommitment}
                >
                  + Add due date
                </button>
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                    color: scheduleMismatch ? 'var(--danger)' : undefined,
                  }}
                >
                  Scheduled {scheduleTotal.toFixed(2)} / residual{' '}
                  {residual.toFixed(2)}
                  {scheduleMismatch &&
                    ` (off by ${(scheduleTotal - residual).toFixed(2)})`}
                </div>
              </div>
              {scheduleBadRow && (
                <div className="alert alert-error" style={{ marginTop: 8 }}>
                  Every scheduled row with an amount needs a due date.
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ── Footer totals + submit ───────────────────────────────────── */}
      <section
        style={{
          marginTop: 22,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 28,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Net
          </div>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18 }}>
            {netTotal.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Paid (splits)
          </div>
          <div
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 18,
              color: overSplit ? 'var(--danger)' : undefined,
            }}
          >
            {paidTotal.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Residual (to A/R)
          </div>
          <div
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 22,
              fontWeight: 700,
              color:
                residual < 0
                  ? 'var(--danger)'
                  : residual === 0
                  ? 'var(--success)'
                  : 'var(--warn)',
            }}
          >
            {residual.toFixed(2)}
          </div>
        </div>
      </section>

      {overSplit && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          Splits exceed the net total by {(paidTotal - netTotal).toFixed(2)}.
          Drop a split or raise the line totals.
        </div>
      )}

      {blockReasons.length > 0 && (
        <div
          className="alert alert-error"
          style={{ marginTop: 12 }}
          role="status"
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Save is blocked — fix the following:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {blockReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!canSubmit || (editing != null && !editReason.trim())}
          title={
            editing != null && !editReason.trim()
              ? 'A correction needs a reason'
              : !canSubmit
                ? blockReasons.join('\n')
                : ''
          }
        >
          {submitting
            ? 'Saving…'
            : editing
              ? 'Save correction'
              : 'Save voucher'}
        </button>
        {editing ? (
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/sales')}
          >
            Cancel correction
          </button>
        ) : (
          <button type="button" className="btn" onClick={reset}>
            Reset
          </button>
        )}
      </div>
    </form>
  );
}
