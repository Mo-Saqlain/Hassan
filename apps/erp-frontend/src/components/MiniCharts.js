/**
 * Tiny hand-rolled SVG charts. No library — keeps the bundle lean (~40 KB
 * less than recharts) and matches the existing flat-Windows-10 aesthetic
 * already established by the dashboard's revenue chart.
 *
 * Each component is a pure function of (data, optional sizing). No effects,
 * no portal weirdness, fits flush inside a card. Heights are intentionally
 * fixed in px so a missing-data render still reserves layout space.
 */

// ---------------------------------------------------------------------------
// Stacked horizontal bar — proportions of a total split across buckets.
// Used by: Dashboard A/R aging.
// ---------------------------------------------------------------------------
export function StackedBar({ segments, height = 26, total }) {
  const sum =
    total ??
    segments.reduce((s, x) => s + (Number(x.value) > 0 ? Number(x.value) : 0), 0);
  if (sum <= 0) {
    return (
      <div className="muted" style={{ fontSize: 12, padding: '6px 0' }}>
        Nothing outstanding.
      </div>
    );
  }
  let cursor = 0;
  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {segments.map((s) => {
          const v = Number(s.value) || 0;
          if (v <= 0) return null;
          const w = (v / sum) * 100;
          const x = cursor;
          cursor += w;
          return (
            <rect
              key={s.label}
              x={x}
              y={0}
              width={w}
              height={height}
              fill={s.color}
            >
              <title>{`${s.label}: Rs ${v.toFixed(0)} (${((v / sum) * 100).toFixed(1)}%)`}</title>
            </rect>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 6,
          fontSize: 11,
        }}
      >
        {segments.map((s) => (
          <span
            key={s.label}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: s.color,
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {Number(s.value || 0).toFixed(0)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut — categorical share of a total. Used for the "Cash Trap" slow-moving
// stock breakdown on the dashboard.
// ---------------------------------------------------------------------------
export function Donut({ segments, size = 120, total, centerLabel, centerValue }) {
  const sum =
    total ?? segments.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const inner = r * 0.6;
  let angle = -Math.PI / 2;
  const arcs = segments
    .map((s) => {
      const v = Math.max(0, Number(s.value) || 0);
      if (sum <= 0 || v <= 0) return null;
      const frac = v / sum;
      const start = angle;
      const end = angle + frac * 2 * Math.PI;
      angle = end;
      const largeArc = frac > 0.5 ? 1 : 0;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const x3 = cx + inner * Math.cos(end);
      const y3 = cy + inner * Math.sin(end);
      const x4 = cx + inner * Math.cos(start);
      const y4 = cy + inner * Math.sin(start);
      const d = [
        `M ${x1} ${y1}`,
        `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${inner} ${inner} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z',
      ].join(' ');
      return { d, color: s.color, label: s.label, value: v, frac };
    })
    .filter(Boolean);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width={size} height={size} style={{ flex: '0 0 auto' }}>
        {sum > 0 ? (
          arcs.map((a, i) => (
            <path key={i} d={a.d} fill={a.color}>
              <title>{`${a.label}: ${a.value.toFixed(0)} (${(a.frac * 100).toFixed(1)}%)`}</title>
            </path>
          ))
        ) : (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
        {centerValue !== undefined && (
          <>
            <text
              x={cx}
              y={cy - 2}
              textAnchor="middle"
              style={{
                fontSize: 14,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fill: 'var(--text)',
              }}
            >
              {centerValue}
            </text>
            {centerLabel && (
              <text
                x={cx}
                y={cy + 12}
                textAnchor="middle"
                style={{ fontSize: 9, fill: 'var(--text-muted)' }}
              >
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>
      <div style={{ flex: '1 1 auto', fontSize: 12 }}>
        {segments.map((s) => {
          const v = Math.max(0, Number(s.value) || 0);
          const pct = sum > 0 ? ((v / sum) * 100).toFixed(1) : '0.0';
          return (
            <div
              key={s.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                padding: '2px 0',
              }}
            >
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: s.color,
                  }}
                />
                <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bullet — progress against a target with a "threshold" marker. Used on
// incentive target rows so the cashier sees "5 units away from the bonus
// tier" at a glance.
// ---------------------------------------------------------------------------
export function Bullet({
  current,
  target,
  threshold,
  height = 16,
  thresholdLabel = 'Trigger',
}) {
  const t = Number(target) || 0;
  const c = Math.max(0, Number(current) || 0);
  const pct = t > 0 ? Math.min(100, (c / t) * 100) : 0;
  const thrPct =
    threshold != null && t > 0
      ? Math.min(100, Math.max(0, (Number(threshold) / 100) * 100))
      : null;
  const achieved = c >= t;
  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <rect
          x={0}
          y={0}
          width={100}
          height={height}
          fill="var(--surface-elev)"
          stroke="var(--border)"
        />
        <rect
          x={0}
          y={0}
          width={pct}
          height={height}
          fill={achieved ? 'var(--success)' : pct >= (thrPct ?? 999) ? '#fbbf24' : 'var(--primary)'}
        >
          <title>{`${c} of ${t} (${pct.toFixed(0)}%)`}</title>
        </rect>
        {thrPct != null && (
          <line
            x1={thrPct}
            y1={-2}
            x2={thrPct}
            y2={height + 2}
            stroke="var(--text)"
            strokeWidth={1.5}
          >
            <title>{`${thresholdLabel} ${threshold}%`}</title>
          </line>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars — categorical ranking. Used for "Margin Leakage Top N".
// ---------------------------------------------------------------------------
export function HorizontalBars({
  rows,
  valueKey = 'value',
  labelKey = 'label',
  rowHeight = 22,
  color = 'var(--danger)',
  formatValue,
}) {
  if (!rows || rows.length === 0) {
    return (
      <div className="muted center" style={{ padding: 12, fontSize: 13 }}>
        No data in this period.
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => Math.abs(Number(r[valueKey]) || 0)));
  return (
    <div>
      {rows.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        const w = max > 0 ? (Math.abs(v) / max) * 100 : 0;
        return (
          <div
            key={`${r[labelKey]}-${i}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 1fr) 1fr 60px',
              alignItems: 'center',
              gap: 8,
              padding: '2px 0',
              fontSize: 12,
            }}
          >
            <span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={r[labelKey]}
            >
              {r[labelKey]}
            </span>
            <div
              style={{
                background: 'var(--surface-elev)',
                border: '1px solid var(--border)',
                height: rowHeight - 8,
                position: 'relative',
              }}
            >
              <div
                style={{
                  background: color,
                  height: '100%',
                  width: `${w}%`,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                textAlign: 'right',
              }}
            >
              {formatValue ? formatValue(v, r) : v.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Funnel — stage counts in a workflow (Delivery / Service ticket). Honest
// stacked-bar rendering rather than a trapezoid funnel; trapezoids are
// visually dramatic but lie about proportions when stage counts are tiny.
// ---------------------------------------------------------------------------
export function FunnelStages({ stages }) {
  const sum = stages.reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (sum <= 0) {
    return (
      <div className="muted center" style={{ padding: 8, fontSize: 13 }}>
        No active tickets in the pipeline.
      </div>
    );
  }
  const max = Math.max(...stages.map((s) => Number(s.value) || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {stages.map((s) => {
        const v = Number(s.value) || 0;
        const w = max > 0 ? (v / max) * 100 : 0;
        return (
          <div
            key={s.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '170px 1fr 40px',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            <div
              style={{
                position: 'relative',
                background: 'var(--surface-elev)',
                border: '1px solid var(--border)',
                height: 18,
              }}
            >
              <div
                style={{
                  background: s.color ?? 'var(--primary)',
                  height: '100%',
                  width: `${w}%`,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                textAlign: 'right',
              }}
            >
              {v}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini line chart with a zero baseline — over/short variance per day.
// ---------------------------------------------------------------------------
export function MiniLine({
  points,
  width = 360,
  height = 80,
  positiveColor = 'var(--success)',
  negativeColor = 'var(--danger)',
  zeroBaseline = true,
  formatY,
}) {
  if (!points || points.length === 0) {
    return (
      <div className="muted center" style={{ padding: 8, fontSize: 13 }}>
        No data yet.
      </div>
    );
  }
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => Number(p.value) || 0);
  const minY = zeroBaseline ? Math.min(0, ...ys) : Math.min(...ys);
  const maxY = zeroBaseline ? Math.max(0, ...ys) : Math.max(...ys);
  const padY = (maxY - minY) * 0.15 || 1;
  const yLo = minY - padY;
  const yHi = maxY + padY;
  const mapX = (i) => (xs.length === 1 ? width / 2 : (i / (xs.length - 1)) * width);
  const mapY = (y) => height - ((y - yLo) / (yHi - yLo)) * height;
  const zeroY = mapY(0);

  // Build per-point segments coloured by sign.
  const segs = [];
  for (let i = 0; i < ys.length - 1; i += 1) {
    const a = { x: mapX(i), y: mapY(ys[i]) };
    const b = { x: mapX(i + 1), y: mapY(ys[i + 1]) };
    const sign = ys[i] + ys[i + 1] >= 0 ? 'pos' : 'neg';
    segs.push({ a, b, sign });
  }

  return (
    <div>
      <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
        {zeroBaseline && (
          <line
            x1={0}
            x2={width}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--border-strong)"
            strokeDasharray="3 3"
          />
        )}
        {segs.map((s, i) => (
          <line
            key={i}
            x1={s.a.x}
            y1={s.a.y}
            x2={s.b.x}
            y2={s.b.y}
            stroke={s.sign === 'pos' ? positiveColor : negativeColor}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        ))}
        {points.map((p, i) => {
          const y = ys[i];
          return (
            <circle
              key={i}
              cx={mapX(i)}
              cy={mapY(y)}
              r={2.5}
              fill={y >= 0 ? positiveColor : negativeColor}
            >
              <title>
                {`${p.label}: ${formatY ? formatY(y) : y.toFixed(2)}`}
              </title>
            </circle>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--text-muted)',
          marginTop: 2,
        }}
      >
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
