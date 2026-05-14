import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Icon from '../components/Icon';

const Rs = (n, dec = 0) =>
  `Rs ${Number(n ?? 0).toLocaleString('en-PK', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}`;

const fmtCompact = (n) => {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return v.toLocaleString('en-PK');
  return v.toFixed(0);
};

const dayLabel = () => {
  const d = new Date();
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export default function Dashboard() {
  const [data, setData] = useState({
    todaySales: 0,
    cashInTill: 0,
    cashEntries: 0,
    lowStockCount: 0,
    criticalLow: 0,
    incomeMTD: 0,
    incentivesMTD: 0,
    customerOwesUs: 0,
    weOweSuppliers: 0,
    topSelling: [],
    activity: [],
    incentive: null,
    allSales: [],
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revenueDays, setRevenueDays] = useState(14);

  useEffect(() => {
    (async () => {
      try {
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
          .toISOString()
          .slice(0, 10);
        const fourteenAgo = new Date(today);
        fourteenAgo.setDate(today.getDate() - 13);
        const fourteenStr = fourteenAgo.toISOString().slice(0, 10);

        const [
          cashDay,
          stockSummary,
          incomeMTD,
          custBalances,
          suppBalances,
          sales,
          purchases,
          payments,
          transfers,
          targets,
        ] = await Promise.all([
          api.get(`/cash-register/day?date=${todayStr}`),
          api.get('/stock/summary'),
          api.get(`/reports/income-statement?from=${monthStart}&to=${todayStr}`),
          api.get('/reports/customer-balances'),
          api.get('/reports/supplier-balances'),
          api.get('/sales'),
          api.get('/purchases'),
          api.get('/payments'),
          api.get('/fund-transfers'),
          api.get('/incentives/targets/progress').catch(() => ({ data: [] })),
        ]);

        // ─ Today's sales (cash + non-cash, from sale.netAmount)
        const todaysSales = (sales.data ?? []).filter((s) =>
          (s.createdAt ?? '').startsWith(todayStr),
        );
        const todaySales = todaysSales.reduce(
          (a, s) => a + Number(s.netAmount ?? 0),
          0,
        );

        // ─ Stock alerts
        const lowStockRows = (stockSummary.data ?? []).filter(
          (r) => r.minStockLevel > 0 && Number(r.onHand) < r.minStockLevel,
        );
        const criticalLow = lowStockRows.filter(
          (r) => Number(r.onHand) <= Math.max(1, r.minStockLevel * 0.3),
        ).length;

        // ─ A/R + A/P
        const customerOwesUs = (custBalances.data ?? [])
          .map((c) => Number(c.balance ?? 0))
          .filter((b) => b > 0)
          .reduce((a, b) => a + b, 0);
        const weOweSuppliers = (suppBalances.data ?? [])
          .map((s) => Number(s.balance ?? 0))
          .filter((b) => b > 0)
          .reduce((a, b) => a + b, 0);

        // ─ Top selling — by total qty across all sales in last 14d
        const last14Sales = (sales.data ?? []).filter(
          (s) => (s.createdAt ?? '') >= fourteenStr,
        );
        const tally = new Map();
        for (const s of last14Sales) {
          for (const line of s.lines ?? []) {
            const name = line.item?.modelNo ?? line.item?.name ?? 'Item';
            tally.set(name, (tally.get(name) ?? 0) + Number(line.quantity ?? 0));
          }
        }
        const topSelling = [...tally.entries()]
          .map(([name, qty]) => ({ name, qty }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 4);

        // ─ Activity feed — merge sales, purchases, payments, transfers
        const activity = [
          ...(sales.data ?? []).slice(0, 12).map((s) => ({
            ref: s.invoiceNo,
            party: s.customer?.name ?? 'Walk-in',
            method: s.paymentMethod,
            amount: Number(s.netAmount ?? 0),
            status:
              Number(s.dueAmount ?? 0) <= 0
                ? 'Paid'
                : Number(s.paidAmount ?? 0) > 0
                ? 'Partial'
                : 'Unpaid',
            kind: 'sale',
            at: s.createdAt,
          })),
          ...(purchases.data ?? []).slice(0, 6).map((p) => ({
            ref: p.billNo,
            party: p.supplier?.name ?? '—',
            method: p.paymentMethod,
            amount: Number(p.netAmount ?? 0),
            status: 'Purchase',
            kind: 'purchase',
            at: p.createdAt,
          })),
          ...(payments.data ?? []).slice(0, 6).map((p) => ({
            ref: p.voucherNo,
            party:
              p.direction === 'IN'
                ? p.customer?.name ?? '—'
                : p.supplier?.name ?? '—',
            method: p.account?.type ?? '—',
            amount: Number(p.amount ?? 0),
            status: p.direction === 'IN' ? 'Received' : 'Paid',
            kind: p.direction === 'IN' ? 'receipt' : 'payment',
            at: p.createdAt,
          })),
          ...(transfers.data ?? []).slice(0, 4).map((t) => ({
            ref: t.transferNo,
            party: `${t.fromAccount?.name ?? '—'} → ${t.toAccount?.name ?? '—'}`,
            method: '—',
            amount: Number(t.amount ?? 0),
            status: 'Transferred',
            kind: 'transfer',
            at: t.createdAt,
          })),
        ]
          .filter((r) => r.at)
          .sort((a, b) => new Date(b.at) - new Date(a.at))
          .slice(0, 6);

        // ─ Active incentive target with most progress
        const progressList = (targets.data ?? []).filter((t) => !t.achieved);
        const incentive =
          progressList.sort((a, b) => b.progressPct - a.progressPct)[0] ?? null;

        setData({
          todaySales,
          cashInTill: cashDay.data?.closing ?? 0,
          cashEntries: cashDay.data?.entries?.length ?? 0,
          lowStockCount: lowStockRows.length,
          criticalLow,
          incomeMTD: Number(incomeMTD.data?.adjustedNetIncome ?? incomeMTD.data?.netIncome ?? 0),
          incentivesMTD: Number(incomeMTD.data?.incentives ?? 0),
          customerOwesUs,
          weOweSuppliers,
          topSelling,
          activity,
          incentive,
          allSales: sales.data ?? [],
        });
      } catch (e) {
        setError(e.uiMessage ?? 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const revenueSeries = useMemo(() => {
    const today = new Date();
    const dayMap = new Map();
    for (let i = 0; i < revenueDays; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (revenueDays - 1) + i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const s of data.allSales) {
      const key = (s.createdAt ?? '').slice(0, 10);
      if (dayMap.has(key)) {
        dayMap.set(key, dayMap.get(key) + Number(s.netAmount ?? 0));
      }
    }
    return [...dayMap.entries()].map(([date, v]) => ({ date, v }));
  }, [data.allSales, revenueDays]);

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Today at the shop</h1>
          <p>{dayLabel()}</p>
        </div>
        <div className="row">
          <Link to="/financials" className="btn btn-sm">
            <Icon name="download" size={14} /> Export
          </Link>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 14, color: 'var(--danger)', marginBottom: 18 }}>
          {error}
        </div>
      )}

      <div className="grid-stat">
        <StatCard
          label="Today's sales"
          unit="Rs"
          value={fmtCompact(data.todaySales)}
          delta={`${data.activity.filter((a) => a.kind === 'sale').length} invoices today`}
          up
          orb="var(--gradient-primary)"
        />
        <StatCard
          label="Cash in till"
          unit="Rs"
          value={fmtCompact(data.cashInTill)}
          delta={`${data.cashEntries} entries`}
          up
          orb="linear-gradient(135deg,#2dd4bf,#06b6d4)"
        />
        <StatCard
          label="Items low on stock"
          value={data.lowStockCount}
          delta={`${data.criticalLow} critical`}
          up={false}
          orb="linear-gradient(135deg,#f472b6,#ef4444)"
        />
        <StatCard
          label="Adjusted Net Income (MTD)"
          unit="Rs"
          value={fmtCompact(data.incomeMTD)}
          delta={data.incentivesMTD > 0 ? `+ ${Rs(data.incentivesMTD)} incentives` : 'No incentives yet'}
          up
          orb="linear-gradient(135deg,#a78bfa,#ec4899)"
        />
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="section-head">
            <div>
              <h2>Revenue, last 14 days</h2>
              <div className="sub">Net of returns &amp; discounts</div>
            </div>
            <div className="row">
              {[14, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={'btn btn-sm' + (revenueDays === d ? '' : ' btn-ghost')}
                  onClick={() => setRevenueDays(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <RevenueChart series={revenueSeries} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="section-head">
            <div>
              <h2>Latest activity</h2>
              <div className="sub">Sales · returns · receipts · transfers</div>
            </div>
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
          ) : data.activity.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No recent activity yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {data.activity.map((t, i) => (
                <ActivityRow key={i} t={t} last={i === data.activity.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="eyebrow">Top selling — last 14 days</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.topSelling.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No sales in the last fortnight.
              </div>
            )}
            {data.topSelling.map((it, i) => {
              const max = data.topSelling[0]?.qty ?? 1;
              const pct = Math.max(8, Math.round((it.qty / max) * 100));
              return (
                <div key={i}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12.5,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{it.name}</span>
                    <span className="num" style={{ color: 'var(--text-muted)' }}>
                      {it.qty} sold
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 0,
                      background: 'var(--chip-bg)',
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--primary)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="eyebrow">Receivables · Payables</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px dashed var(--border)',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Owed to you</div>
                <div
                  className="num"
                  style={{ fontSize: 22, fontWeight: 700, color: '#34d399' }}
                >
                  {Rs(data.customerOwesUs)}
                </div>
              </div>
              <Link to="/customer-ledger" className="btn btn-sm btn-ghost">
                <Icon name="arrow-up" size={16} />
              </Link>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>You owe</div>
                <div
                  className="num"
                  style={{ fontSize: 22, fontWeight: 700, color: '#fda4af' }}
                >
                  {Rs(data.weOweSuppliers)}
                </div>
              </div>
              <Link to="/supplier-ledger" className="btn btn-sm btn-ghost">
                <Icon name="arrow-down" size={16} />
              </Link>
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: 16,
            background: 'var(--surface)',
            borderLeft: '3px solid var(--primary)',
          }}
        >
          <div className="eyebrow" style={{ color: 'var(--primary)' }}>
            Incentive · this period
          </div>
          {data.incentive ? (
            <>
              <h2 style={{ marginTop: 10, fontSize: 18 }}>
                {data.incentive.target?.name ?? 'Active target'}
              </h2>
              <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-soft)' }}>
                {data.incentive.netQuantity} / {data.incentive.targetQuantity} units sold ·{' '}
                {Rs(data.incentive.potentialIncentive)} unlocks at{' '}
                {data.incentive.targetQuantity}
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 0,
                  background: 'var(--chip-bg)',
                  overflow: 'hidden',
                  marginTop: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    width: `${data.incentive.progressPct}%`,
                    height: '100%',
                    background: 'var(--primary)',
                  }}
                />
              </div>
              <Link to="/incentives" className="btn btn-sm" style={{ marginTop: 14 }}>
                View progress <Icon name="arrow-right" size={13} />
              </Link>
            </>
          ) : (
            <>
              <h2 style={{ marginTop: 10, fontSize: 18 }}>No active targets</h2>
              <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-soft)' }}>
                Set up a target to track manufacturer incentives.
              </div>
              <Link to="/incentives" className="btn btn-sm" style={{ marginTop: 14 }}>
                Add target <Icon name="arrow-right" size={13} />
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, unit, value, delta, up, orb }) {
  return (
    <div className="stat">
      <div className="stat-orb" style={{ '--stat-orb': orb }} />
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {unit && <span className="unit">{unit}</span>}
        {value}
      </div>
      <div className="stat-foot">
        <span className={'delta ' + (up ? 'up' : 'down')}>
          {up ? '▲' : '▼'} {delta}
        </span>
      </div>
    </div>
  );
}

function ActivityRow({ t, last }) {
  const iconName =
    t.kind === 'purchase'
      ? 'package'
      : t.kind === 'receipt'
      ? 'receipt'
      : t.kind === 'transfer'
      ? 'transfer'
      : t.kind === 'payment'
      ? 'card'
      : 'card';
  const chip =
    t.status === 'Paid'
      ? 'chip-success'
      : t.status === 'Partial'
      ? 'chip-warn'
      : t.status === 'Received'
      ? 'chip-info'
      : t.status === 'Transferred'
      ? 'chip-violet'
      : 'chip-info';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto auto',
        gap: 12,
        padding: '10px 4px',
        alignItems: 'center',
        borderBottom: last ? 'none' : '1px dashed var(--border)',
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 0,
          background: 'var(--chip-bg)',
          border: '1px solid var(--border)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--primary)',
        }}
      >
        <Icon name={iconName} size={15} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.party}</div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {t.ref} · {t.method}
        </div>
      </div>
      <div className="num" style={{ fontWeight: 600 }}>
        {Rs(t.amount)}
      </div>
      <span className={'chip ' + chip}>{t.status}</span>
    </div>
  );
}

/**
 * Inline SVG line chart with violet→cyan gradient stroke and a soft fill.
 * Uses a Catmull-Rom-ish smoothing path (simplified to lines) — keeps the
 * curve looking organic without pulling in a chart library.
 */
function RevenueChart({ series }) {
  const points = useMemo(() => {
    if (!series || series.length === 0) return [];
    const max = Math.max(1, ...series.map((p) => p.v));
    const W = 600;
    const H = 220;
    const padX = 20;
    const padY = 30;
    const innerW = W - padX * 2;
    const innerH = H - padY * 2;
    const step = innerW / Math.max(1, series.length - 1);
    return series.map((p, i) => ({
      x: padX + i * step,
      y: padY + innerH - (p.v / max) * innerH,
      v: p.v,
      date: p.date,
    }));
  }, [series]);

  if (points.length < 2) {
    return (
      <div className="chart" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
        Not enough data yet
      </div>
    );
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const fillPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},220 L${points[0].x.toFixed(1)},220 Z`;

  return (
    <div className="chart">
      <svg viewBox="0 0 600 220" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rcFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="rcStroke" x1="0" x2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="60%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#rcFill)" />
        <path d={linePath} stroke="url(#rcStroke)" strokeWidth="2.5" fill="none" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="var(--bg-elev)"
            stroke="#a78bfa"
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  );
}
