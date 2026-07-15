import { useResource } from '../hooks/useResource';
import ExportButtons from '../components/ExportButtons';

/**
 * Reorder / low-stock report — every active item whose available stock has
 * fallen to or below its reorder level, with a suggested top-up quantity.
 * A printable / exportable purchase list. Data is read-only from
 * `GET /reports/reorder`; set an item's minimum level on the Item Catalogue.
 */
const COLUMNS = [
  { key: 'name', label: 'Item' },
  { key: 'sku', label: 'SKU' },
  { key: 'onHand', label: 'On hand', align: 'right' },
  { key: 'reserved', label: 'Reserved', align: 'right' },
  { key: 'available', label: 'Available', align: 'right' },
  { key: 'minStockLevel', label: 'Min level', align: 'right' },
  { key: 'suggestedQty', label: 'Suggested order', align: 'right' },
];

export default function ReorderReport() {
  const { data, loading, error } = useResource('/reports/reorder');

  const rows = data?.rows ?? [];

  return (
    <>
      <div className="page-header">
        <h2>Reorder / Low Stock</h2>
        <ExportButtons
          filename="reorder_report"
          title="Reorder / Low Stock — Hassan Electronics"
          subtitle="Items at or below their reorder level"
          columns={COLUMNS}
          rows={rows}
        />
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Available = on-hand − reserved. Set each item's minimum level on the Item
        Catalogue; items with no level set don't appear here.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card muted center">
          Nothing to reorder — every item with a minimum level is above it. 🎉
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow">Items to reorder</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
                {data.count}
              </div>
            </div>
            <div>
              <div className="eyebrow">Total suggested units</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
                {data.totalSuggestedUnits}
              </div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th className="right">On hand</th>
                <th className="right">Reserved</th>
                <th className="right">Available</th>
                <th className="right">Min level</th>
                <th className="right">Suggested order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId}>
                  <td>{r.name}</td>
                  <td className="mono">{r.sku}</td>
                  <td className="right mono">{r.onHand}</td>
                  <td className="right mono">{r.reserved}</td>
                  <td className="right mono">
                    <span
                      className={
                        r.available <= 0 ? 'chip chip-danger' : 'chip chip-warn'
                      }
                    >
                      {r.available}
                    </span>
                  </td>
                  <td className="right mono">{r.minStockLevel}</td>
                  <td className="right mono">
                    <strong>{r.suggestedQty}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
