import { useEffect, useState } from 'react';
import { api } from '../api/client';

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
      <div className="page-header">
        <h2>Financial Statements</h2>
      </div>

      <div className="report-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`report-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => {
              if (t.key !== tab) {
                setData(null);
                setTab(t.key);
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="form-row" style={{ marginBottom: 0 }}>
          {tab === 'balance' ? (
            <div>
              <label>As of</label>
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
          ) : (
            <>
              <div>
                <label>From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label>To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {data && !loading && (
        <>
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

function Line({ label, value, indent, total }) {
  return (
    <div className={total ? 'total' : 'line'}>
      <span className={indent ? 'indent' : ''}>{label}</span>
      <span>{fmt(value)}</span>
    </div>
  );
}

function IncomeStatement({ data }) {
  if (!data?.revenue || !data?.cogs) return null;
  const r = data.revenue;
  const c = data.cogs;
  return (
    <div className="statement">
      <h3>Income Statement</h3>
      <div className="section-head">Revenue</div>
      <Line label="Gross Revenue" value={r.grossRevenue} indent />
      <Line label="(–) Sales Discounts" value={r.discounts} indent />
      <Line label="Net Revenue" value={r.netRevenue} indent />
      <Line label="(–) Sales Returns" value={r.returns} indent />
      <Line label="Revenue after Returns" value={r.revenueAfterReturns} total />

      <div className="section-head">Cost of Goods Sold</div>
      <Line label="COGS" value={c.cogs} indent />
      <Line label="(–) Returns COGS" value={c.returnsCogs} indent />
      <Line label="Net COGS" value={c.netCogs} total />

      <Line label="Gross Profit" value={data.grossProfit} total />

      <div className="section-head">Operating Expenses</div>
      <Line label="Expenses" value={data.expenses} indent />
      <Line label="Net Income" value={data.netIncome} total />
    </div>
  );
}

function BalanceSheet({ data }) {
  if (!data?.assets || !data?.liabilities) return null;
  const a = data.assets;
  const l = data.liabilities;
  return (
    <div className="statement">
      <h3>Balance Sheet — as of {new Date(data.asOf).toLocaleDateString()}</h3>

      <div className="section-head">Assets</div>
      <Line label="Cash on Hand" value={a.cash} indent />
      <Line label="Bank Accounts" value={a.bank} indent />
      <Line label="Wallet" value={a.wallet} indent />
      <Line label="Inventory (at cost)" value={a.inventory} indent />
      <Line label="Accounts Receivable" value={a.accountsReceivable} indent />
      <Line label="Total Assets" value={a.total} total />

      <div className="section-head">Liabilities</div>
      <Line label="Accounts Payable" value={l.accountsPayable} indent />
      <Line label="Total Liabilities" value={l.total} total />

      <div className="section-head">Equity</div>
      <Line label="Owner's Equity" value={data.equity} total />
    </div>
  );
}

function CashFlow({ data }) {
  if (!data?.operating) return null;
  const o = data.operating;
  return (
    <div className="statement">
      <h3>Cash Flow Statement</h3>

      <div className="section-head">Operating Activities</div>
      <Line label="Receipts (vouchers)" value={o.receipts} indent />
      <Line label="Cash from Sales" value={o.cashSales} indent />
      <Line label="Total Inflows" value={o.inflows} indent />
      <Line label="(–) Payment vouchers" value={o.payments} indent />
      <Line label="(–) Cash for Purchases" value={o.cashPurchases} indent />
      <Line label="Total Outflows" value={o.outflows} indent />
      <Line label="Net Operating Cash" value={o.net} total />

      <div className="section-head">Summary</div>
      <Line label="Beginning Cash" value={data.beginningCash} indent />
      <Line label="Net Change in Cash" value={data.netChange} indent />
      <Line label="Ending Cash" value={data.endingCash} total />
    </div>
  );
}

function EquityChanges({ data }) {
  if (!data?.balanceCheck) return null;
  return (
    <div className="statement">
      <h3>Statement of Changes in Equity</h3>
      <Line label="Opening Equity" value={data.openingEquity} indent />
      <Line label="(+) Net Income for Period" value={data.netIncome} indent />
      <Line label="(–) Drawings" value={data.drawings} indent />
      <Line label="Closing Equity" value={data.closingEquity} total />

      <div className="section-head">Reconciliation</div>
      <Line label="Expected (Opening + Net Income)" value={data.balanceCheck.expected} indent />
      <Line label="Actual Closing" value={data.balanceCheck.actual} indent />
      <Line label="Difference" value={data.balanceCheck.difference} indent />
    </div>
  );
}
