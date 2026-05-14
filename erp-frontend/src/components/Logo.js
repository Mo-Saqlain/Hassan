/**
 * Hassan Electronics brand mark — transparent PNG, no backdrop.
 *
 * The source PNG ([public/logo192.png]) is the HE monogram on a transparent
 * background. We deliberately render it with no chip / frame; the white
 * half of the monogram may disappear on a light-themed surface, which is
 * mitigated by the per-page theme toggle (e.g. on the login screen).
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
