/**
 * Read-only ledger renderer. Takes a ledger payload from the reports API
 * and renders a chronological list with running balance.
 *
 * Used by both Customer (A/R) and Supplier (A/P) ledger pages.
 */
export default function LedgerView({ title, party, ledger }) {
  if (!ledger) return <div className="muted">Loading…</div>;

  const fmt = (n) => Number(n).toFixed(2);

  return (
    <>
      <div className="ledger-summary">
        <StatLine label="Opening" value={fmt(ledger.openingBalance)} />
        <StatLine label="Total Debit" value={fmt(ledger.totalDebit)} color="var(--info)" />
        <StatLine label="Total Credit" value={fmt(ledger.totalCredit)} color="var(--success)" />
        <StatLine
          label="Closing Balance"
          value={fmt(ledger.closingBalance)}
          color={
            ledger.closingBalance > 0
              ? 'var(--danger)'
              : ledger.closingBalance < 0
              ? 'var(--success)'
              : undefined
          }
        />
      </div>

      {ledger.entries.length === 0 ? (
        <div className="card muted center">No transactions yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref #</th>
              <th>Type</th>
              <th>Description</th>
              <th className="right">Debit</th>
              <th className="right">Credit</th>
              <th className="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledger.entries.map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.date).toLocaleDateString()}</td>
                <td>{e.ref}</td>
                <td>
                  <span className="badge badge-gray">{e.type}</span>
                </td>
                <td>{e.description}</td>
                <td className="right">{e.debit ? fmt(e.debit) : '—'}</td>
                <td className="right">{e.credit ? fmt(e.credit) : '—'}</td>
                <td className="right">
                  <strong>{fmt(e.balance)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function StatLine({ label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-body">
        <div className="label">{label}</div>
        <div className="value" style={color ? { color } : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
}
