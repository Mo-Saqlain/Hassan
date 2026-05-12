/* global React */
// Icon library — Lucide-style inline SVG, ~30 icons used across the app.
// Stroke 1.75, currentColor, sized via `size` prop.

const Icon = ({ name, size = 18, strokeWidth = 1.75, style }) => {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", style };
  const path = (d) => React.createElement("path", { d });
  switch (name) {
    case "dashboard": return <svg {...p}><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>;
    case "pos": return <svg {...p}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 18v3"/><path d="M16 18v3"/><path d="M3 10h18"/><path d="M7 14h1"/><path d="M11 14h2"/></svg>;
    case "master": return <svg {...p}><circle cx="12" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M12 9v3"/><path d="M9 15l3-3 3 3"/></svg>;
    case "tx": return <svg {...p}><path d="M7 7h13"/><path d="M16 3l4 4-4 4"/><path d="M17 17H4"/><path d="M8 21l-4-4 4-4"/></svg>;
    case "cash": return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v.01"/><path d="M18 14v.01"/></svg>;
    case "stock": return <svg {...p}><path d="M12 3l9 4-9 4-9-4 9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></svg>;
    case "ledger": return <svg {...p}><path d="M4 4h12a3 3 0 013 3v13"/><path d="M4 4v16h15"/><path d="M8 8h7"/><path d="M8 12h7"/><path d="M8 16h5"/></svg>;
    case "reports": return <svg {...p}><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/><circle cx="18" cy="8" r="1.2"/></svg>;
    case "incentive": return <svg {...p}><path d="M12 2l2.39 4.84 5.34.78-3.86 3.77.91 5.31L12 14.27 7.22 16.7l.91-5.31L4.27 7.62l5.34-.78z"/></svg>;
    case "backup": return <svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6"/></svg>;
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case "sun": return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
    case "moon": return <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case "minus": return <svg {...p}><path d="M5 12h14"/></svg>;
    case "trash": return <svg {...p}><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>;
    case "x": return <svg {...p}><path d="M18 6L6 18M6 6l12 12"/></svg>;
    case "chevron": return <svg {...p}><path d="M9 18l6-6-6-6"/></svg>;
    case "arrow-up": return <svg {...p}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case "arrow-down": return <svg {...p}><path d="M12 5v14M5 12l7 7 7-7"/></svg>;
    case "arrow-right": return <svg {...p}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "bolt": return <svg {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>;
    case "sparkles": return <svg {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7z"/></svg>;
    case "card": return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>;
    case "bank": return <svg {...p}><path d="M3 10l9-6 9 6"/><path d="M5 10v9M19 10v9M9 10v9M15 10v9"/><path d="M3 20h18"/></svg>;
    case "credit": return <svg {...p}><path d="M5 8l4 4-4 4"/><path d="M19 16l-4-4 4-4"/><circle cx="12" cy="12" r="9"/></svg>;
    case "receipt": return <svg {...p}><path d="M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16l-3-2-3 2-3-2-3 2-2-2z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>;
    case "filter": return <svg {...p}><path d="M3 4h18l-7 9v7l-4-2v-5z"/></svg>;
    case "download": return <svg {...p}><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>;
    case "menu": return <svg {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>;
    case "package": return <svg {...p}><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>;
    case "transfer": return <svg {...p}><path d="M7 16l-3-3 3-3"/><path d="M4 13h13"/><path d="M17 8l3 3-3 3"/><path d="M20 11H8"/></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>;
    case "logo": return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
        <path d="M5 4h3v7h8V4h3v16h-3v-7H8v7H5V4z" fill="white"/>
        <path d="M13.5 8.5L11 13h2.2l-.7 3.5L15 12h-2.2l.7-3.5z" fill="rgba(255,255,255,0.85)"/>
      </svg>
    );
    default: return null;
  }
};

window.Icon = Icon;
