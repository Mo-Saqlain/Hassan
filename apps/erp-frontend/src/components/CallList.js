import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from './ExportButtons';
import WhatsAppButton from './WhatsAppButton';
import { balanceReminderMessage } from '../utils/whatsapp';

/**
 * Combined receivables / payables "call list" — one screen the shopkeeper
 * prints or dials down when collecting money. Customers who owe us (A/R) on
 * one toggle, suppliers we owe (A/P) on the other, each with phone, balance,
 * and how overdue they are (most-overdue first).
 *
 * Self-contained: fetches `/reports/call-list` itself and owns its CSV / PDF
 * export, so it drops into the Reports page without touching the shared
 * statement-loading machinery. `balance` is ledger-accurate; `daysOverdue` is
 * invoice-based, so a pure loan / opening balance shows a real balance with 0
 * days (aging is invoice-driven — documented behaviour).
 */
const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

// Column contract shared by the on-screen table and the CSV / PDF export.
const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone', value: (r) => r.phone ?? '—' },
  { key: 'balance', label: 'Balance (Rs)', align: 'right', value: (r) => money(r.balance) },
  {
    key: 'oldestUnpaidDate',
    label: 'Oldest unpaid',
    value: (r) => fmtDate(r.oldestUnpaidDate),
  },
  { key: 'maxDaysElapsed', label: 'Days overdue', align: 'right' },
];

export default function CallList({ asOf }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [side, setSide] = useState('receivables');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/reports/call-list${asOf ? `?asOf=${asOf}` : ''}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.uiMessage ?? 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  const rows = useMemo(
    () => (data ? (side === 'receivables' ? data.receivables : data.payables) : []),
    [data, side],
  );

  const isAr = side === 'receivables';
  const title = isAr ? 'Receivables — customers who owe us' : 'Payables — suppliers we owe';

  if (loading) return <div className="muted">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  return (
    <>
      <div
        className="row"
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div className="tabs">
          <div
            className={'tab ' + (isAr ? 'active' : '')}
            onClick={() => setSide('receivables')}
          >
            Receivables ({data.receivables.length})
          </div>
          <div
            className={'tab ' + (!isAr ? 'active' : '')}
            onClick={() => setSide('payables')}
          >
            Payables ({data.payables.length})
          </div>
        </div>
        <ExportButtons
          filename={`call_list_${side}`}
          title={`${title} — ${SHOP_LABEL}`}
          subtitle={`As of ${fmtDate(data.asOf)}`}
          columns={COLUMNS}
          rows={rows}
        />
      </div>

      <div className="row" style={{ gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
        <Stat label="Total receivable" value={money(data.totals.receivable)} tone="pos" />
        <Stat label="Total payable" value={money(data.totals.payable)} tone="neg" />
        <Stat
          label="Net position"
          value={money(data.totals.net)}
          tone={data.totals.net >= 0 ? 'pos' : 'neg'}
        />
      </div>

      {rows.length === 0 ? (
        <div className="card muted center">
          {isAr ? 'No one owes you right now.' : 'You owe no suppliers right now.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th className="right">Balance</th>
              <th>Oldest unpaid</th>
              <th className="right">Days overdue</th>
              <th className="right no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.partyId}>
                <td>{r.name}</td>
                <td className="mono">{r.phone ?? '—'}</td>
                <td className="right mono">{money(r.balance)}</td>
                <td>{fmtDate(r.oldestUnpaidDate)}</td>
                <td className="right mono">
                  {r.maxDaysElapsed > 0 ? (
                    <span className={r.maxDaysElapsed > 30 ? 'chip chip-danger' : 'chip chip-warn'}>
                      {r.maxDaysElapsed}d
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="right no-print">
                  {isAr && (
                    <WhatsAppButton
                      phone={r.phone}
                      message={balanceReminderMessage({ name: r.name, balance: r.balance })}
                      label="Remind"
                      className="btn btn-sm"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const SHOP_LABEL = 'Hassan Electronics';

function Stat({ label, value, tone }) {
  const color = tone === 'neg' ? 'var(--danger, #ef4444)' : 'var(--success, #16a34a)';
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color }}>
        Rs {value}
      </div>
    </div>
  );
}
