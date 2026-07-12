/**
 * WhatsApp share helpers.
 *
 * Delivery is via the free `wa.me` deep link — clicking a Send button opens
 * WhatsApp (Web/Desktop on a PC, the app on mobile) with the customer's
 * number and a prefilled text message. There is NO backend, no API token,
 * and no per-message cost. Attachments (the printed PDF) are added manually
 * by the staff after the chat opens — wa.me can only carry text.
 *
 * The shop name is the same literal used by the sidebar brand mark
 * (components/Brand.js); keep them in sync if the shop is ever renamed.
 */
export const SHOP_NAME = 'Hassan Electronics';

/** "Rs 85,000" — whole rupees, thousands-grouped. */
export function money(n) {
  const num = Number(n || 0);
  return `Rs ${num.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

/**
 * Coerce a Pakistani phone number into the bare international digits that
 * wa.me expects (country code + number, no `+`, spaces, or dashes). Handles
 * the formats staff actually type: `0300-1234567`, `+92 300 1234567`,
 * `923001234567`, `3001234567`. Returns null when the input can't be turned
 * into a plausible number — callers then fall back to the no-number picker.
 */
export function normalizePkPhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2); // 00 international prefix
  if (d.startsWith('92')) return d.slice(0, 12); // already country-coded
  if (d.startsWith('0')) return '92' + d.slice(1); // local 0300… → 92300…
  if (d.length === 10 && d.startsWith('3')) return '92' + d; // bare mobile
  return d; // unknown shape — hand the digits to WhatsApp and let it decide
}

/**
 * Open WhatsApp with a prefilled message. When `phone` can't be normalised
 * the chat opens without a recipient so the user can pick a contact.
 */
export function openWhatsApp(phone, message) {
  const num = normalizePkPhone(phone);
  const text = encodeURIComponent(message ?? '');
  const url = num
    ? `https://wa.me/${num}?text=${text}`
    : `https://wa.me/?text=${text}`;
  window.open(url, '_blank', 'noopener');
}

/* ───────────────────────────── Message builders ───────────────────────────── */

export function invoiceMessage(sale) {
  const lines = [
    `*${SHOP_NAME}*`,
    `Invoice ${sale.invoiceNo}`,
    `Date: ${fmtDate(sale.createdAt)}`,
    '',
  ];
  for (const ln of sale.lines ?? []) {
    lines.push(
      `• ${ln.item?.name ?? 'Item'} × ${ln.quantity} = ${money(ln.lineTotal)}`,
    );
  }
  lines.push('');
  lines.push(`Net: ${money(sale.netAmount)}`);
  lines.push(`Paid: ${money(sale.paidAmount)}`);
  if (Number(sale.dueAmount) > 0.005) {
    lines.push(`*Balance due: ${money(sale.dueAmount)}*`);
  }
  lines.push('');
  lines.push('Thank you for your business.');
  return lines.join('\n');
}

export function balanceReminderMessage({ name, balance }) {
  return [
    `*${SHOP_NAME}*`,
    '',
    `Dear ${name || 'customer'},`,
    `This is a friendly reminder that your outstanding balance with us is *${money(balance)}*.`,
    'Kindly clear it at your earliest convenience.',
    '',
    'Thank you.',
  ].join('\n');
}

export function bookingMessage(sale) {
  const next = (sale.paymentCommitments ?? []).find(
    (c) => c.status === 'PENDING',
  );
  const lines = [
    `*${SHOP_NAME}* — Booking receipt`,
    `Booking ${sale.invoiceNo}`,
    `Booked: ${fmtDate(sale.createdAt)}`,
    '',
    `Net total: ${money(sale.netAmount)}`,
    `Advance paid: ${money(sale.paidAmount)}`,
    `*Balance pending: ${money(sale.dueAmount)}*`,
  ];
  if (next) lines.push(`Please pay by: ${fmtDate(next.dueDate)}`);
  lines.push('');
  lines.push('Goods will be released once the balance is cleared. Thank you.');
  return lines.join('\n');
}

export function warrantyMessage({
  model,
  serial,
  invoiceNo,
  warrantyType,
  warrantyEndAt,
  warrantyDays,
}) {
  return [
    `*${SHOP_NAME}* — Warranty details`,
    '',
    model ? `Item: ${model}` : null,
    serial ? `Serial: ${serial}` : null,
    invoiceNo ? `Receipt: ${invoiceNo}` : null,
    `Warranty: ${warrantyType ?? '—'}${warrantyDays ? ` (${warrantyDays} days)` : ''}`,
    warrantyEndAt ? `Valid until: ${fmtDate(warrantyEndAt)}` : null,
    '',
    'Please keep this message and your receipt for warranty claims.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}
