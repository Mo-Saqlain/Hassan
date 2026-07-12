/**
 * Hassan Electronics brand mark — transparent PNG, no backdrop.
 *
 * The source PNG ([public/logo192.png]) is the HE monogram (gold "H" + blue
 * "E", house roof + spark) on a transparent background. Rendered with no chip
 * / frame; both the gold and blue read fine on light and dark surfaces.
 * Regenerate from `erp-frontend/logo.png` via `scripts/make-icons.ps1`.
 * See [[feedback-logo-no-chip]] in memory.
 */
export default function Logo({ size = 72, className = '', title = 'Hassan Electronics' }) {
  return (
    <img
      src={`${process.env.PUBLIC_URL || ''}/logo192.png`}
      alt={title}
      title={title}
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ display: 'block', userSelect: 'none' }}
    />
  );
}
