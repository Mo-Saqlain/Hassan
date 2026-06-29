/**
 * Minimal RFC-4180-ish CSV parser for the master-data import feature.
 *
 * Handles quoted fields, embedded commas / newlines, doubled-quote escaping
 * (""), CRLF or LF line endings, and a leading UTF-8 BOM (Excel writes one).
 * Returns `{ headers, rows }` where each row is an object keyed by the trimmed
 * header. Fully-blank lines are skipped.
 */
export function parseCsv(text) {
  const records = parseRecords(text);
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    if (rec.length === 1 && rec[0].trim() === '') continue; // blank line
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (rec[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function parseRecords(text) {
  const t = String(text).replace(/^﻿/, ''); // strip BOM
  const records = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  return records;
}
