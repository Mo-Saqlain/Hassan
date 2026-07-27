import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from '../components/ExportButtons';
import CallList from '../components/CallList';
import { HorizontalBars } from '../components/MiniCharts';

const tabs = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cash', label: 'Cash Flow' },
  { key: 'equity', label: 'Changes in Equity' },
  { key: 'margins', label: 'Margin Insights' },
  { key: 'product-sales', label: 'Product Sales' },
  { key: 'customers-by-product', label: 'Customers by Product' },
  { key: 'call-list', label: 'Receivables / Payables' },
];

const ANALYTICS_TABS = new Set(['product-sales', 'customers-by-product']);

export default function Financials() {
  const [tab, setTab] = useState('income');
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Scope pickers — only used by the two product-analytics tabs.
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [scope, setScope] = useState({ itemId: '', categoryId: '', brandId: '' });

  // Selecting one scope dimension clears the others — the backend applies a
  // first-non-empty-wins precedence, so mutually-exclusive pickers keep the
  // UI honest about what actually gets filtered.
  const updateScope = (k, v) =>
    setScope({ itemId: '', categoryId: '', brandId: '', [k]: v });

  useEffect(() => {
    Promise.all([api.get('/items'), api.get('/categories'), api.get('/brands')])
      .then(([i, c, b]) => {
        setItems(i.data);
        setCategories(c.data);
        setBrands(b.data);
      })
      .catch(() => {});
  }, []);

  const load = async () => {
    // The call-list tab renders a self-contained component that fetches its
    // own data — nothing for the shared statement loader to do here.
    if (tab === 'call-list') {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let url = '';
      if (tab === 'income') url = `/reports/income-statement?from=${from}&to=${to}`;
      else if (tab === 'balance') url = `/reports/balance-sheet?asOf=${asOf}`;
      else if (tab === 'cash') url = `/reports/cash-flow?from=${from}&to=${to}`;
      else if (tab === 'equity') url = `/reports/equity-changes?from=${from}&to=${to}`;
      else if (tab === 'margins') url = `/reports/margin-analytics?from=${from}&to=${to}`;
      else if (tab === 'product-sales') {
        const q = new URLSearchParams({ from, to });
        if (scope.categoryId) q.append('categoryId', scope.categoryId);
        if (scope.brandId) q.append('brandId', scope.brandId);
        url = `/reports/product-sales?${q.toString()}`;
      } else if (tab === 'customers-by-product') {
        const q = new URLSearchParams({ from, to });
        if (scope.itemId) q.append('itemId', scope.itemId);
        else if (scope.categoryId) q.append('categoryId', scope.categoryId);
        else if (scope.brandId) q.append('brandId', scope.brandId);
        url = `/reports/customers-by-product?${q.toString()}`;
      }
      const r = await api.get(url);
      setData(r.data);
    } catch (e) {
      setError(e.uiMessage ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  // Reload whenever the tab changes; user clicks Apply to re-run with new dates.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const isAnalytics = ANALYTICS_TABS.has(tab);

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>{isAnalytics ? 'Sales analysis' : 'Financial statements'}</h1>
          <p>
            {tab === 'balance' || tab === 'call-list'
              ? `As of ${asOf}`
              : `${from} → ${to}`}
            {tab === 'call-list'
              ? ' · most overdue first'
              : isAnalytics
                ? ' · reversed sales excluded'
                : ' · incentives applied to adjusted net income'}
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {isAnalytics && (
            <>
              {tab === 'customers-by-product' && (
                <select
                  className="input"
                  value={scope.itemId}
                  onChange={(e) => updateScope('itemId', e.target.value)}
                  style={{ maxWidth: 220 }}
                >
                  <option value="">— Any item —</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="input"
                value={scope.categoryId}
                onChange={(e) => updateScope('categoryId', e.target.value)}
                style={{ maxWidth: 200 }}
              >
                <option value="">— Any category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={scope.brandId}
                onChange={(e) => updateScope('brandId', e.target.value)}
                style={{ maxWidth: 200 }}
              >
                <option value="">— Any brand —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {tab === 'balance' || tab === 'call-list' ? (
            <input
              className="input"
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              style={{ maxWidth: 160 }}
            />
          ) : (
            <>
              <input
                className="input"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                style={{ maxWidth: 160 }}
              />
              <input
                className="input"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={{ maxWidth: 160 }}
              />
            </>
          )}
          <button className="btn btn-sm btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Apply'}
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {tabs.map((t) => (
          <div
            key={t.key}
            className={'tab ' + (tab === t.key ? 'active' : '')}
            onClick={() => {
              if (t.key !== tab) {
                setData(null);
                setTab(t.key);
              }
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {data && !loading && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: 10,
            }}
          >
            <ExportButtons
              filename={`report_${tab}`}
              title={tabTitle(tab)}
              subtitle={periodLabel(tab, data, asOf, from, to)}
              columns={
                isAnalytics
                  ? analyticsColumns(tab)
                  : [
                      { key: 'label', label: 'Item' },
                      { key: 'value', label: 'Amount', align: 'right' },
                    ]
              }
              rows={
                isAnalytics ? analyticsRows(tab, data) : flattenStatement(tab, data)
              }
            />
          </div>
          {tab === 'income' && <IncomeStatement data={data} />}
          {tab === 'balance' && <BalanceSheet data={data} />}
          {tab === 'cash' && <CashFlow data={data} />}
          {tab === 'equity' && <EquityChanges data={data} />}
          {tab === 'margins' && <MarginInsights data={data} />}
          {tab === 'product-sales' && <ProductSales data={data} />}
          {tab === 'customers-by-product' && <CustomersByProduct data={data} />}
        </>
      )}

      {tab === 'call-list' && <CallList asOf={asOf} />}
    </>
  );
}

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function tabTitle(tab) {
  switch (tab) {
    case 'income':
      return 'Income Statement';
    case 'balance':
      return 'Balance Sheet';
    case 'cash':
      return 'Cash Flow Statement';
    case 'equity':
      return 'Statement of Changes in Equity';
    case 'margins':
      return 'Margin Insights';
    case 'product-sales':
      return 'Product Sales (by category)';
    case 'customers-by-product':
      return 'Customers by Product';
    default:
      return 'Financial Statement';
  }
}

/** Export column defs for the two product-analytics tabs. */
function analyticsColumns(tab) {
  if (tab === 'product-sales') {
    return [
      { key: 'category', label: 'Category' },
      { key: 'name', label: 'Item' },
      { key: 'sku', label: 'SKU' },
      { key: 'brandName', label: 'Brand' },
      { key: 'qty', label: 'Units', align: 'right' },
      { key: 'revenue', label: 'Revenue', align: 'right' },
      { key: 'cogs', label: 'COGS', align: 'right' },
      { key: 'grossProfit', label: 'Gross Profit', align: 'right' },
      { key: 'marginPct', label: 'Margin %', align: 'right' },
    ];
  }
  return [
    { key: 'name', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'qty', label: 'Units', align: 'right' },
    { key: 'invoices', label: 'Invoices', align: 'right' },
    { key: 'spend', label: 'Spend', align: 'right' },
  ];
}

/** Flatten an analytics response into export rows. */
function analyticsRows(tab, d) {
  if (!d) return [];
  if (tab === 'product-sales') {
    return (d.categories ?? []).flatMap((cat) =>
      cat.items.map((it) => ({
        category: cat.categoryName,
        name: it.name,
        sku: it.sku,
        brandName: it.brandName,
        qty: it.qty,
        revenue: fmt(it.revenue),
        cogs: fmt(it.cogs),
        grossProfit: fmt(it.grossProfit),
        marginPct: Number(it.marginPct).toFixed(1),
      })),
    );
  }
  return (d.rows ?? []).map((r) => ({
    name: r.name,
    phone: r.phone ?? '',
    qty: r.qty,
    invoices: r.invoices,
    spend: fmt(r.spend),
  }));
}

function periodLabel(tab, data, asOf, from, to) {
  if (tab === 'balance' && data?.asOf) {
    return `As of ${new Date(data.asOf).toLocaleDateString()}`;
  }
  if (data?.period?.from || data?.period?.to) {
    return `${data.period.from ?? '…'}  to  ${data.period.to ?? '…'}`;
  }
  if (tab === 'balance') return `As of ${asOf}`;
  return `${from} to ${to}`;
}

/**
 * Flatten a structured financial statement into a list of {label, value}
 * rows that CSV/PDF exporters can consume.
 */
function flattenStatement(tab, d) {
  const out = [];
  if (tab === 'income' && d?.revenue && d?.cogs) {
    const r = d.revenue;
    const c = d.cogs;
    out.push(
      { label: 'Gross Revenue', value: fmt(r.grossRevenue) },
      { label: '(–) Sales Discounts', value: fmt(r.discounts) },
      { label: 'Net Revenue', value: fmt(r.netRevenue) },
      { label: '(–) Sales Returns', value: fmt(r.returns) },
      { label: 'Revenue after Returns', value: fmt(r.revenueAfterReturns) },
      { label: 'COGS', value: fmt(c.cogs) },
      { label: '(–) Returns COGS', value: fmt(c.returnsCogs) },
      { label: 'Net COGS', value: fmt(c.netCogs) },
      { label: 'Gross Profit', value: fmt(d.grossProfit) },
      {
        label: 'Employee Incentives (per sale × rule)',
        value: fmt(d.employeeIncentives ?? 0),
      },
      {
        label: 'Other Expenses',
        value: fmt(Math.max(0, (d.expenses ?? 0) - (d.employeeIncentives ?? 0))),
      },
      { label: 'Net Income (trading)', value: fmt(d.netIncome) },
      { label: '(+) Incentive Awards', value: fmt(d.incentives ?? 0) },
      { label: 'Adjusted Net Income', value: fmt(d.adjustedNetIncome ?? d.netIncome) },
    );
  } else if (tab === 'balance' && d?.assets && d?.liabilities) {
    const a = d.assets;
    const l = d.liabilities;
    const eq =
      typeof d.equity === 'object' && d.equity !== null
        ? d.equity
        : { total: d.equity ?? 0, capitalContributed: 0, retainedEarnings: 0 };
    out.push(
      { label: 'Cash on Hand', value: fmt(a.cash) },
      { label: 'Bank Accounts', value: fmt(a.bank) },
      { label: 'Wallet', value: fmt(a.wallet) },
      { label: 'Inventory (at cost)', value: fmt(a.inventory) },
      { label: 'Accounts Receivable', value: fmt(a.accountsReceivable) },
      { label: 'Total Assets', value: fmt(a.total) },
      { label: 'Accounts Payable', value: fmt(l.accountsPayable) },
      { label: 'Credit Card / Credit Line', value: fmt(l.creditPayable ?? 0) },
      { label: 'Total Liabilities', value: fmt(l.total) },
      { label: 'Owner Capital Contributed', value: fmt(eq.capitalContributed) },
      { label: 'Retained Earnings', value: fmt(eq.retainedEarnings) },
      { label: 'Total Equity', value: fmt(eq.total) },
    );
  } else if (tab === 'cash' && d?.operating) {
    const o = d.operating;
    out.push(
      { label: 'Receipts (vouchers)', value: fmt(o.receipts) },
      { label: 'Cash from Sales', value: fmt(o.cashSales) },
      { label: 'Total Inflows', value: fmt(o.inflows) },
      { label: '(–) Payment vouchers', value: fmt(o.payments) },
      { label: '(–) Cash for Purchases', value: fmt(o.cashPurchases) },
      { label: 'Total Outflows', value: fmt(o.outflows) },
      { label: 'Net Operating Cash', value: fmt(o.net) },
      { label: 'Beginning Cash', value: fmt(d.beginningCash) },
      { label: 'Net Change in Cash', value: fmt(d.netChange) },
      { label: 'Ending Cash', value: fmt(d.endingCash) },
    );
  } else if (tab === 'equity' && d?.balanceCheck) {
    out.push(
      { label: 'Opening Equity', value: fmt(d.openingEquity) },
      { label: '(+) Net Income for Period', value: fmt(d.netIncome) },
      { label: '(+) Incentive Awards', value: fmt(d.incentives ?? 0) },
      { label: '(–) Drawings', value: fmt(d.drawings) },
      { label: 'Closing Equity', value: fmt(d.closingEquity) },
      { label: 'Expected (Opening + Net Income)', value: fmt(d.balanceCheck.expected) },
      { label: 'Actual Closing', value: fmt(d.balanceCheck.actual) },
      { label: 'Difference', value: fmt(d.balanceCheck.difference) },
    );
  }
  return out;
}

function Group({ label, value }) {
  return (
    <div className="stmt-row group">
      <div>{label}</div>
      {value != null && <div className="v">{fmt(value)}</div>}
    </div>
  );
}

function Sub({ label, value, prefix }) {
  return (
    <div className="stmt-row sub">
      <div>{label}</div>
      <div className="v">
        {prefix}
        {fmt(value)}
      </div>
    </div>
  );
}

function Sum({ label, value }) {
  return (
    <div className="stmt-row sum">
      <div>{label}</div>
      <div className="v">{fmt(value)}</div>
    </div>
  );
}

function Final({ label, value }) {
  return (
    <div className="stmt-row final">
      <div>{label}</div>
      <div className="v">Rs {fmt(value)}</div>
    </div>
  );
}

function IncomeStatement({ data }) {
  if (!data?.revenue || !data?.cogs) return null;
  const r = data.revenue;
  const c = data.cogs;
  return (
    <div className="card stmt" style={{ padding: '6px 0 14px' }}>
      <Group label="Revenue" />
      <Sub label="Gross sales" value={r.grossRevenue} prefix="" />
      <Sub label="Less: discounts" value={r.discounts} prefix="− " />
      <Sub label="Less: sales returns" value={r.returns} prefix="− " />
      <Sum label="Net revenue" value={r.revenueAfterReturns} />

      <Group label="Cost of goods sold" />
      <Sub label="COGS at cost" value={c.cogs} prefix="− " />
      <Sub label="Returns at cost" value={c.returnsCogs} prefix="+ " />
      <Sum label="Gross profit" value={data.grossProfit} />

      <Group label="Operating expenses" />
      <Sub
        label="Employee incentives (per sale × rule)"
        value={data.employeeIncentives ?? 0}
        prefix="− "
      />
      {Array.isArray(data.expenseBreakdown) && data.expenseBreakdown.length > 0 ? (
        data.expenseBreakdown.map((e) => (
          <Sub key={e.category} label={e.category} value={e.amount} prefix="− " />
        ))
      ) : (
        <Sub
          label="Shop expenses"
          value={data.operatingExpenses ?? 0}
          prefix="− "
        />
      )}
      <Sum label="Net income (trading)" value={data.netIncome} />

      <Group label="Incentives" />
      <Sub label="Awards received in period" value={data.incentives ?? 0} prefix="+ " />
      <Final
        label="Adjusted net income"
        value={data.adjustedNetIncome ?? data.netIncome}
      />
    </div>
  );
}

function BalanceSheet({ data }) {
  if (!data?.assets || !data?.liabilities) return null;
  const a = data.assets;
  const l = data.liabilities;
  const eq =
    typeof data.equity === 'object' && data.equity !== null
      ? data.equity
      : { total: data.equity ?? 0, capitalContributed: 0, retainedEarnings: 0 };
  return (
    <div className="grid-2">
      <div className="card stmt" style={{ padding: '6px 0 14px' }}>
        <Group label="Assets" value={a.total} />
        <Sub label="Cash on hand" value={a.cash} prefix="" />
        <Sub label="Bank balances" value={a.bank} prefix="" />
        <Sub label="Wallet" value={a.wallet} prefix="" />
        <Sub label="Inventory at cost" value={a.inventory} prefix="" />
        <Sub label="Accounts receivable" value={a.accountsReceivable} prefix="" />
      </div>
      <div className="card stmt" style={{ padding: '6px 0 14px' }}>
        <Group label="Liabilities" value={l.total} />
        <Sub label="Accounts payable" value={l.accountsPayable} prefix="" />
        <Sub label="Credit payable" value={l.creditPayable ?? 0} prefix="" />
        <Group label="Equity" value={eq.total} />
        <Sub label="Owner capital contributed" value={eq.capitalContributed} prefix="" />
        <Sub label="Retained earnings" value={eq.retainedEarnings} prefix="" />
      </div>
    </div>
  );
}

function CashFlow({ data }) {
  if (!data?.operating) return null;
  const o = data.operating;
  return (
    <div className="card stmt" style={{ padding: '6px 0 14px' }}>
      <Group label="Operating activities" />
      <Sub label="Cash receipts from customers" value={o.receipts} prefix="+ " />
      <Sub label="Cash sales" value={o.cashSales} prefix="+ " />
      <Sub label="Cash paid to suppliers" value={o.payments} prefix="− " />
      <Sub label="Cash paid for purchases" value={o.cashPurchases} prefix="− " />
      <Sum label="Net operating cash" value={o.net} />
      <Group label="Summary" />
      <Sub label="Beginning cash" value={data.beginningCash} prefix="" />
      <Sub label="Net change in cash" value={data.netChange} prefix="" />
      <Final label="Ending cash" value={data.endingCash} />
    </div>
  );
}

function EquityChanges({ data }) {
  if (!data?.balanceCheck) return null;
  return (
    <div className="card stmt" style={{ padding: '6px 0 14px' }}>
      <Sub label="Opening equity" value={data.openingEquity} prefix="" />
      <Sub label="(+) Net income for period" value={data.netIncome} prefix="+ " />
      {(data.incentives ?? 0) > 0 && (
        <Sub label="(+) Incentive awards" value={data.incentives} prefix="+ " />
      )}
      <Sub label="(−) Drawings" value={data.drawings} prefix="− " />
      <Final label="Closing equity" value={data.closingEquity} />

      <Group label="Reconciliation" />
      <Sub label="Expected (Opening + Net Income)" value={data.balanceCheck.expected} prefix="" />
      <Sub label="Actual closing" value={data.balanceCheck.actual} prefix="" />
      <Sub label="Difference" value={data.balanceCheck.difference} prefix="" />
    </div>
  );
}

/**
 * MarginInsights — three lenses on the same period:
 *   • Brand profitability (by-brand bar chart of marginPct)
 *   • Margin leakage (lowest-margin sale lines, ascending)
 *   • Discount leakage (highest-discount sales)
 *
 * Purely a presentation wrapper around `/reports/margin-analytics`.
 */
function MarginInsights({ data }) {
  if (!data) return null;
  const byBrand = (data.byBrand ?? []).slice(0, 10);
  const lowest = (data.lowestMarginSales ?? []).slice(0, 10);
  const highDisc = (data.highDiscountSales ?? []).slice(0, 10);
  const pct = (n) => `${Number(n ?? 0).toFixed(1)}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Margin by brand</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          Gross-profit % across all units of each brand sold in the period.
        </p>
        <HorizontalBars
          rows={byBrand.map((r) => ({
            label: r.brandName,
            value: r.marginPct,
            grossProfit: r.grossProfit,
          }))}
          color="var(--success)"
          formatValue={(v) => pct(v)}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Margin leakage — lowest-margin sale lines</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          Specific lines where the unit price barely cleared (or fell below)
          the snapshotted cost. If the same item keeps appearing, raise its
          floor price or restrict salesman discount permissions.
        </p>
        <HorizontalBars
          rows={lowest.map((r) => ({
            label: `${r.itemName} · ${r.invoiceNo}`,
            value: r.marginPct,
          }))}
          color="var(--danger)"
          formatValue={(v) => pct(v)}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>High-discount sales</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          Invoices with the largest absolute discount. Cross-reference with
          who the customer was — relationship pricing should be a deliberate
          owner call, not a habit.
        </p>
        <HorizontalBars
          rows={highDisc.map((r) => ({
            label: `${r.customerName ?? 'Walk-in'} · ${r.invoiceNo}`,
            value: r.discountPct,
            discount: r.discount,
          }))}
          color="var(--warning)"
          formatValue={(v, r) => `${pct(v)} · Rs ${Number(r.discount ?? 0).toFixed(0)}`}
        />
      </div>
    </div>
  );
}

/** Summary tile used by the two product-analytics tabs. */
function Stat({ label, value, money, pct, color }) {
  const display = pct
    ? `${Number(value ?? 0).toFixed(1)}%`
    : money
      ? `Rs ${fmt(value)}`
      : Number(value ?? 0).toLocaleString();
  return (
    <div className="stat-card">
      <div className="stat-body">
        <div className="label">{label}</div>
        <div className="value" style={color ? { color } : undefined}>
          {display}
        </div>
      </div>
    </div>
  );
}

/**
 * ProductSales — sales-by-product summary grouped by category. Each category
 * card carries a subtotal strip; the top ledger-summary shows the grand total
 * for the period. Units / revenue / COGS / gross-profit / margin per item.
 */
function ProductSales({ data }) {
  if (!data?.categories) return null;
  const t = data.totals ?? {};
  if (data.categories.length === 0) {
    return <div className="card muted center">No sales in this period.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ledger-summary">
        <Stat label="Units sold" value={t.qty} />
        <Stat label="Revenue" value={t.revenue} money />
        <Stat label="COGS" value={t.cogs} money />
        <Stat
          label="Gross profit"
          value={t.grossProfit}
          money
          color="var(--success)"
        />
        <Stat label="Margin" value={t.marginPct} pct />
      </div>

      {data.categories.map((cat) => (
        <div className="card" key={cat.categoryId ?? '__none__'}>
          <div
            className="row"
            style={{
              justifyContent: 'space-between',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <h3 style={{ margin: 0 }}>{cat.categoryName}</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {Number(cat.qty).toLocaleString()} units · Rs {fmt(cat.revenue)} ·
              GP Rs {fmt(cat.grossProfit)} ({Number(cat.marginPct).toFixed(1)}%)
            </span>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Brand</th>
                <th className="right">Units</th>
                <th className="right">Revenue</th>
                <th className="right">COGS</th>
                <th className="right">Gross profit</th>
                <th className="right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {cat.items.map((it) => (
                <tr key={it.itemId}>
                  <td>{it.name}</td>
                  <td>{it.sku}</td>
                  <td>{it.brandName}</td>
                  <td className="right">{Number(it.qty).toLocaleString()}</td>
                  <td className="right">{fmt(it.revenue)}</td>
                  <td className="right">{fmt(it.cogs)}</td>
                  <td className="right">{fmt(it.grossProfit)}</td>
                  <td className="right">{Number(it.marginPct).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/**
 * CustomersByProduct — every customer that bought the selected product scope
 * in the window, ranked by units. Shows units, distinct-invoice count, and
 * total spend per customer. Walk-in sales collapse into one labelled row.
 */
function CustomersByProduct({ data }) {
  if (!data?.rows) return null;
  const t = data.totals ?? {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: '10px 14px' }}>
        <strong>Scope:</strong> {data.scope?.label ?? 'All products'}
      </div>

      <div className="ledger-summary">
        <Stat label="Customers" value={t.customers} />
        <Stat label="Units bought" value={t.qty} />
        <Stat label="Invoices" value={t.invoices} />
        <Stat label="Total spend" value={t.spend} money />
      </div>

      {data.rows.length === 0 ? (
        <div className="card muted center">
          No buyers for this scope in the period.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th className="right">#</th>
              <th>Customer</th>
              <th>Phone</th>
              <th className="right">Units</th>
              <th className="right">Invoices</th>
              <th className="right">Spend</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={r.customerId ?? `walkin-${i}`}>
                <td className="right">{i + 1}</td>
                <td>{r.name}</td>
                <td>{r.phone ?? '—'}</td>
                <td className="right">
                  <strong>{Number(r.qty).toLocaleString()}</strong>
                </td>
                <td className="right">{r.invoices}</td>
                <td className="right">Rs {fmt(r.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
