import ExportButtons from './ExportButtons';

/**
 * Read-only ledger renderer. Takes a ledger payload from the reports API
 * and renders a chronological list with running balance.
 *
 * Used by Customer (A/R), Supplier (A/P), and Account ledger pages.
 */
export default function LedgerView({ title, party, ledger }) {
  if (!ledger) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>;

  const fmt = (n) => Number(n).toFixed(2);
  const Rs = (n) => `Rs ${fmt(n)}`;

  const exportColumns = [
    { key: 'date', label: 'Date', value: (e) => new Date(e.date).toLocaleDateString() },
    { key: 'ref', label: 'Ref #' },
    { key: 'type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'debit', label: 'Debit', align: 'right', value: (e) => (e.debit ? fmt(e.debit) : '') },
    { key: 'credit', label: 'Credit', align: 'right', value: (e) => (e.credit ? fmt(e.credit) : '') },
    { key: 'balance', label: 'Balance', align: 'right', value: (e) => fmt(e.balance) },
  ];
  const subtitle =
    `${party?.name ?? ''} · Opening ${fmt(ledger.openingBalance)}` +
    ` · Closing ${fmt(ledger.closingBalance)}`;

  const closingPositive = ledger.closingBalance > 0;
  const partyLabelTone =
    closingPositive ? 'owes you' : ledger.closingBalance < 0 ? 'in credit' : 'settled';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <ExportButtons
          filename={`${(title ?? 'ledger').replace(/\s+/g, '_').toLowerCase()}_ledger`}
          title={`${party?.name ?? 'Ledger'}`}
          subtitle={subtitle}
          columns={exportColumns}
          rows={ledger.entries}
          footer={`<tr><td colspan="6" style="text-align:right">Closing Balance</td><td style="text-align:right">${fmt(ledger.closingBalance)}</td></tr>`}
        />
      </div>

      <div className="panel-stripe" style={{ marginBottom: 18 }}>
        <div>
          <div className="label">Opening balance</div>
          <div className="v num">{Rs(ledger.openingBalance)}</div>
        </div>
        <div>
          <div className="label">Current balance · {partyLabelTone}</div>
          <div
            className="v num"
            style={{
              background: 'var(--gradient-primary)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {Rs(ledger.closingBalance)}
          </div>
        </div>
      </div>

      {ledger.entries.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 32,
            color: 'var(--text-muted)',
            textAlign: 'center',
            fontSize: 13,
          }}
        >
          No transactions yet.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Date</th>
                <th>Ref</th>
                <th>Type</th>
                <th>Description</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.map((e, i) => (
                <tr key={i}>
                  <td
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {new Date(e.date).toLocaleDateString()}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {e.ref}
                  </td>
                  <td>
                    <span className="chip">{e.type}</span>
                  </td>
                  <td>{e.description}</td>
                  <td
                    className="num"
                    style={{ color: e.debit ? 'var(--text)' : 'var(--text-faint)' }}
                  >
                    {e.debit ? fmt(e.debit) : '—'}
                  </td>
                  <td
                    className="num"
                    style={{ color: e.credit ? '#34d399' : 'var(--text-faint)' }}
                  >
                    {e.credit ? fmt(e.credit) : '—'}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {fmt(e.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
