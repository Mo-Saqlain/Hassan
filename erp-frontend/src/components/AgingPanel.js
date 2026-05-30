/**
 * Renders the per-document aging detail above a ledger view. Fed by
 * `GET /reports/ar-aging/:customerId` or `/reports/ap-aging/:supplierId`.
 * Columns: doc number, date, net, residual, days elapsed (colour-coded).
 *
 * Days-elapsed grading:
 *   >= 30 days   danger (red)        — overdue, chase priority
 *   >= 15 days   warning (amber)     — getting old
 *   <  15 days   muted               — fresh
 *
 * For customer aging the extra "Promise" column lights up when the sale
 * carries a paymentCommitment that's already past due — these are the
 * customers who broke an explicit "pay by" date.
 */
export default function AgingPanel({
  title,
  lines,
  numKey,
  showPromiseColumn,
}) {
  const dayColor = (d) => {
    if (d >= 30) return 'var(--danger)';
    if (d >= 15) return 'var(--warning)';
    return 'var(--text-muted)';
  };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 15 }}>
        {title}
      </h3>
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>{numKey === 'invoiceNo' ? 'Invoice' : 'Bill'}</th>
            <th>Date</th>
            <th className="right">Net</th>
            <th className="right">Residual</th>
            <th className="right">Days Elapsed</th>
            {showPromiseColumn && <th className="right">Past Promise</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => (
            <tr key={ln[numKey]}>
              <td style={{ fontFamily: 'var(--font-mono)' }}>{ln[numKey]}</td>
              <td>{new Date(ln.createdAt).toLocaleDateString()}</td>
              <td className="right">{Number(ln.netAmount).toFixed(2)}</td>
              <td
                className="right"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                }}
              >
                {Number(ln.residualAmount).toFixed(2)}
              </td>
              <td
                className="right"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: dayColor(ln.daysElapsed),
                }}
              >
                {ln.daysElapsed}d
              </td>
              {showPromiseColumn && (
                <td className="right">
                  {ln.daysSinceFirstPastPromise != null ? (
                    <span
                      className="chip chip-danger"
                      style={{ fontSize: 10.5 }}
                      title={`Promise was ${ln.daysSinceFirstPastPromise} days ago`}
                    >
                      {ln.daysSinceFirstPastPromise}d
                    </span>
                  ) : ln.hasPendingCommitment ? (
                    <span
                      className="chip chip-info"
                      style={{ fontSize: 10.5 }}
                      title="Customer has a promise date in the future"
                    >
                      promised
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
