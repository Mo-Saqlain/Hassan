/**
 * CSV + PDF export helpers for tables, ledgers, and statements.
 *
 * Columns format used everywhere:
 *   [{ key: 'name', label: 'Name', value: row => ..., align: 'right' }]
 * `value` is optional; if missing the helper reads `row[key]` directly.
 */

const escapeCsv = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const cellValue = (row, col) => {
  const v = col.value ? col.value(row) : row[col.key];
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return v;
};

const todayStamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
};

/** Trigger a CSV download in the user's browser. */
export function exportCsv({ filename, columns, rows }) {
  const headers = columns.map((c) => escapeCsv(c.label ?? c.key)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCsv(cellValue(row, c))).join(','))
    .join('\n');
  // BOM so Excel opens UTF-8 files in the right encoding by default.
  const csv = '﻿' + headers + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${todayStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open a print-friendly window with the data laid out as a clean table,
 * and immediately fire the browser print dialog. The user picks
 * "Save as PDF" as the destination — works on every platform without
 * shipping a PDF library on the backend.
 */
export function exportPdf({ title, subtitle, columns, rows, footer }) {
  const win = window.open('', '_blank', 'noopener');
  if (!win) {
    alert('Please allow popups so the printable view can open.');
    return;
  }
  const renderCell = (row, col) => {
    const v = cellValue(row, col);
    return String(v ?? '');
  };
  const headerRow = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align ?? 'left'}">${escapeHtml(c.label ?? c.key)}</th>`,
    )
    .join('');
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${columns
          .map(
            (c) =>
              `<td style="text-align:${c.align ?? 'left'}">${escapeHtml(renderCell(row, c))}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');

  const printedAt = new Date().toLocaleString();

  win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
        color: #0f172a;
        margin: 28px;
      }
      h1 {
        font-size: 18px;
        margin: 0 0 4px;
      }
      .sub { color: #64748b; font-size: 12px; margin-bottom: 16px; }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        padding: 6px 8px;
        border-bottom: 1px solid #cbd5e1;
        vertical-align: top;
      }
      th {
        background: #f1f5f9;
        font-weight: 600;
        text-align: left;
        text-transform: uppercase;
        font-size: 10.5px;
        letter-spacing: 0.5px;
      }
      tfoot td {
        font-weight: 600;
        background: #f8fafc;
      }
      .meta {
        margin-top: 18px;
        color: #94a3b8;
        font-size: 10.5px;
        text-align: right;
      }
      @media print {
        body { margin: 16mm; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
    <table>
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="' + columns.length + '" style="text-align:center;color:#64748b">No data</td></tr>'}</tbody>
      ${footer ? `<tfoot>${footer}</tfoot>` : ''}
    </table>
    <div class="meta">Hassan Electronics · printed ${escapeHtml(printedAt)}</div>
    <script>setTimeout(() => { window.print(); }, 80);</script>
  </body>
</html>`);
  win.document.close();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
