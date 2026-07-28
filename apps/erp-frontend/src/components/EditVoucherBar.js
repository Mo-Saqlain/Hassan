/**
 * Banner shown above a voucher form when it is correcting an existing document
 * rather than creating a new one.
 *
 * Corrections go through `PATCH /<path>/:id`, which keeps the document's number
 * and row and re-posts it (stock, journal, serials, cost). The reason is required
 * by the API — it's the only record of WHY a posted document changed, and the one
 * thing an accountant will want when the figure they remember doesn't match.
 *
 * Props:
 *   - label:      what's being corrected, e.g. "INV-000123"
 *   - reason:     current reason text
 *   - onReason:   reason change handler
 *   - onCancel:   abandon the correction and go back to a blank form
 *   - editCount:  how many times this document has already been corrected
 */
export default function EditVoucherBar({
  label,
  reason,
  onReason,
  onCancel,
  editCount,
}) {
  return (
    <div
      className="card"
      style={{
        borderLeft: '3px solid var(--warn, #c19c00)',
        marginBottom: 12,
        display: 'grid',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <strong>
          Correcting {label}
          {editCount > 0 && (
            <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
              already corrected {editCount}×
            </span>
          )}
        </strong>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel correction
        </button>
      </div>
      <label style={{ display: 'grid', gap: 4 }}>
        <span>Reason for the correction *</span>
        <input
          className="input"
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder="e.g. price was keyed as 500, invoice says 450"
          required
        />
      </label>
      <span className="muted" style={{ fontSize: 12 }}>
        The document keeps its number. Its stock movements and ledger entries are
        re-posted, and the original stays visible in the stock ledger and journal.
      </span>
    </div>
  );
}
