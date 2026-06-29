import { openWhatsApp } from '../utils/whatsapp';

/**
 * Opens WhatsApp (Web/Desktop or the mobile app) with a prefilled message to
 * the given phone number. When `phone` is missing, WhatsApp opens its contact
 * picker instead — the button still works, it just can't pre-target.
 *
 * Styled as a plain `.btn` so it sits beside Print / Close in the existing
 * no-print action rows; flat Windows-10 chrome, no icon assets added.
 */
export default function WhatsAppButton({
  phone,
  message,
  label = 'Send on WhatsApp',
  className = 'btn',
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => openWhatsApp(phone, message)}
      title={
        phone
          ? `Send to ${phone}`
          : 'No phone on file — WhatsApp will ask you to pick a contact'
      }
    >
      {label}
    </button>
  );
}
