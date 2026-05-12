import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from '../components/ExportButtons';

const tabs = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cash', label: 'Cash Flow' },
  { key: 'equity', label: 'Changes in Equity' },
];

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

  const load = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let url = '';
      if (tab === 'income') url = `/reports/income-statement?from=${from}&to=${to}`;
      else if (tab === 'balance') url = `/reports/balance-sheet?asOf=${asOf}`;
      else if (tab === 'cash') url = `/reports/cash-flow?from=${from}&to=${to}`;
      else if (tab === 'equity') url = `/reports/equity-changes?from=${from}&to=${to}`;
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

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Financial statements</h1>
          <p>
            {tab === 'balance'
              ? `As of ${asOf}`
              : `${from} → ${to}`}{' '}
            · incentives applied to adjusted net income
          </p>
        </div>
        <div className="row">
          {tab === 'balance' ? (
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
              filename={`financials_${tab}`}
              title={tabTitle(tab)}
              subtitle={periodLabel(tab, data, asOf, from, to)}
              columns={[
                { key: 'label', label: 'Item' },
                { key: 'value', label: 'Amount', align: 'right' },
              ]}
              rows={flattenStatement(tab, data)}
            />
          </div>
          {tab === 'income' && <IncomeStatement data={data} />}
          {tab === 'balance' && <BalanceSheet data={data} />}
          {tab === 'cash' && <CashFlow data={data} />}
          {tab === 'equity' && <EquityChanges data={data} />}
        </>
      )}
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
    default:
      return 'Financial Statement';
  }
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
      <Sub
        label="Other expenses"
        value={Math.max(0, (data.expenses ?? 0) - (data.employeeIncentives ?? 0))}
        prefix="− "
      />
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
