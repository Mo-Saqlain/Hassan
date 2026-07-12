/**
 * Single inline-SVG icon component. Lucide-style stroke set; uses currentColor.
 * Usage: <Icon name="cart" size={20} />
 *
 * Names match the redesign handoff plus a few legacy aliases kept for
 * backwards compatibility with existing components.
 */

const ICONS = {
  // Sidebar / navigation
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </>
  ),
  pos: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 18v3" />
      <path d="M16 18v3" />
      <path d="M3 10h18" />
      <path d="M7 14h1" />
      <path d="M11 14h2" />
    </>
  ),
  master: (
    <>
      <circle cx="12" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M12 9v3" />
      <path d="M9 15l3-3 3 3" />
    </>
  ),
  tx: (
    <>
      <path d="M7 7h13" />
      <path d="M16 3l4 4-4 4" />
      <path d="M17 17H4" />
      <path d="M8 21l-4-4 4-4" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2.5 3h2l2.5 13.5h13L22 7H6" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 10v.01" />
      <path d="M18 14v.01" />
    </>
  ),
  stock: (
    <>
      <path d="M12 3l9 4-9 4-9-4 9-4z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </>
  ),
  boxes: (
    <>
      <path d="M12 3l9 4-9 4-9-4 9-4z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </>
  ),
  warehouse: (
    <>
      <path d="M3 21V9l9-5 9 5v12" />
      <path d="M7 21v-7h10v7" />
      <path d="M9 14h6M9 17h6" />
    </>
  ),
  ledger: (
    <>
      <path d="M4 4h12a3 3 0 013 3v13" />
      <path d="M4 4v16h15" />
      <path d="M8 8h7" />
      <path d="M8 12h7" />
      <path d="M8 16h5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4h12a3 3 0 013 3v13" />
      <path d="M4 4v16h15" />
      <path d="M8 8h7" />
      <path d="M8 12h7" />
      <path d="M8 16h5" />
    </>
  ),
  reports: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 14l3-3 3 3 5-6" />
      <circle cx="18" cy="8" r="1.2" />
    </>
  ),
  chartBar: (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="13" width="3" height="5" rx="0.5" />
      <rect x="12" y="9" width="3" height="9" rx="0.5" />
      <rect x="17" y="5" width="3" height="13" rx="0.5" />
    </>
  ),
  incentive: (
    <path d="M12 2l2.39 4.84 5.34.78-3.86 3.77.91 5.31L12 14.27 7.22 16.7l.91-5.31L4.27 7.62l5.34-.78z" />
  ),
  trophy: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3" />
      <path d="M10 14h4v3h-4zM8 21h8" />
    </>
  ),
  backup: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v5c0 5 3.5 9.4 8 10 4.5-.6 8-5 8-10V6l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),

  // Topbar / UI chrome
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  chevron: <path d="M9 18l6-6-6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </>
  ),

  // Arrows
  'arrow-up': <path d="M12 19V5M5 12l7-7 7 7" />,
  'arrow-down': <path d="M12 5v14M5 12l7 7 7-7" />,
  'arrow-right': <path d="M5 12h14M13 5l7 7-7 7" />,
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

  // Theme + brand decoration
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  moon: <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  sparkles: (
    <>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7z" />
    </>
  ),

  // Domain icons
  package: (
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  box: (
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
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
  rotate: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  transfer: (
    <>
      <path d="M7 16l-3-3 3-3" />
      <path d="M4 13h13" />
      <path d="M17 8l3 3-3 3" />
      <path d="M20 11H8" />
    </>
  ),
  swap: (
    <>
      <path d="M7 16l-3-3 3-3" />
      <path d="M4 13h13" />
      <path d="M17 8l3 3-3 3" />
      <path d="M20 11H8" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16l-3-2-3 2-3-2-3 2-2-2z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  bank: (
    <>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v9M19 10v9M9 10v9M15 10v9" />
      <path d="M3 20h18" />
    </>
  ),
  credit: (
    <>
      <path d="M5 8l4 4-4 4" />
      <path d="M19 16l-4-4 4-4" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  filter: <path d="M3 4h18l-7 9v7l-4-2v-5z" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
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

  // Brand mark (used in the gradient chip)
  logo: (
    <>
      <path d="M5 4h3v7h8V4h3v16h-3v-7H8v7H5V4z" fill="white" stroke="none" />
      <path
        d="M13.5 8.5L11 13h2.2l-.7 3.5L15 12h-2.2l.7-3.5z"
        fill="rgba(255,255,255,0.85)"
        stroke="none"
      />
    </>
  ),
};

export default function Icon({ name, size = 18, strokeWidth = 1.75, className, ...rest }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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
