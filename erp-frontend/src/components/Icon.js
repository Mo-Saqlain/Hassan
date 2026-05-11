/**
 * Single inline-SVG icon component. Stroke-based, inherits currentColor.
 * Usage: <Icon name="cart" size={20} />
 */

const ICONS = {
  // Sidebar
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  pos: (
    <>
      <path d="M6 2h12l-1 4H7L6 2z" />
      <rect x="4" y="6" width="16" height="16" rx="2" />
      <path d="M9 14h6M9 18h6" />
    </>
  ),
  master: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5" />
      <path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2.5 3h2l2.5 13.5h13L22 7H6" />
    </>
  ),
  rotate: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  package: (
    <>
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  packageX: (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
      <path d="m17 13-5 5M12 13l5 5" />
    </>
  ),
  arrowDownCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l4 4 4-4M12 8v8" />
    </>
  ),
  arrowUpCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M16 12l-4-4-4 4M12 16V8" />
    </>
  ),
  boxes: (
    <>
      <path d="M3 7v10l4 2 5-2 5 2 4-2V7l-4-2-5 2-5-2L3 7z" />
      <path d="M12 7v12M3 7l5 2M21 7l-5 2" />
    </>
  ),

  // Master Data tiles
  box: (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  folderTree: (
    <>
      <path d="M3 5a2 2 0 0 1 2-2h3l2 2h4a2 2 0 0 1 2 2v1" />
      <path d="M3 7v6a2 2 0 0 0 2 2h2" />
      <path d="M13 11a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8z" />
      <path d="M9 15h4" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.4 13 21l-9-9V4h8l9 9-.4.4z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  truck: (
    <>
      <path d="M3 17h11V6H3v11z" />
      <path d="M14 9h4l3 3v5h-7V9z" />
      <circle cx="7" cy="18.5" r="2" />
      <circle cx="17.5" cy="18.5" r="2" />
    </>
  ),
  store: (
    <>
      <path d="M3 9 5 4h14l2 5" />
      <path d="M3 9v11h18V9" />
      <path d="M3 9c0 1.5 1.5 3 3.5 3s3.5-1.5 3.5-3" />
      <path d="M10 9c0 1.5 1 3 2 3s2-1.5 2-3" />
      <path d="M14 9c0 1.5 1.5 3 3.5 3s3.5-1.5 3.5-3" />
      <path d="M9 20v-4h6v4" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </>
  ),

  // Misc UI
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  moon: (
    <>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
};

export default function Icon({ name, size = 20, className, ...rest }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  );
}
