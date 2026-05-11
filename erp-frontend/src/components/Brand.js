/** Brand mark + name for Hassan Electronics. */
export default function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden>
        <svg viewBox="0 0 32 32" width="34" height="34">
          <defs>
            <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="32" height="32" rx="9" fill="url(#brandGrad)" />
          <path
            d="M18 6 8 18h6l-1 8 10-12h-6l1-8Z"
            fill="#fef3c7"
            stroke="#fef3c7"
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="brand-text">
        <div className="brand-name">Hassan Electronics</div>
        <div className="brand-tag">Home Appliances</div>
      </div>
    </div>
  );
}
