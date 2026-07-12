import { exportCsv, exportPdf } from '../utils/exporters';

/**
 * Pair of "CSV" / "PDF" buttons that any table or report can render to
 * give the cashier a one-click export. PDF goes through the browser's
 * print dialog so users save it via "Save as PDF" — no backend PDF lib
 * needed.
 */
export default function ExportButtons({
  filename,
  title,
  subtitle,
  columns,
  rows,
  footer,
  disabled,
  size = 'sm',
}) {
  const empty = !rows || rows.length === 0;
  const btnClass = `btn btn-${size}`;
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button
        type="button"
        className={btnClass}
        disabled={disabled || empty}
        onClick={() => exportCsv({ filename, columns, rows })}
        title="Download as CSV (opens in Excel / Google Sheets)"
      >
        CSV
      </button>
      <button
        type="button"
        className={btnClass}
        disabled={disabled || empty}
        onClick={() => exportPdf({ title, subtitle, columns, rows, footer })}
        title="Open print view — choose 'Save as PDF' as the destination"
      >
        PDF
      </button>
    </span>
  );
}
