interface CpuRamGaugeProps {
  value: number
  max?: number
  label: string
  color?: string
  height?: number
  /**
   * A previous compact layout gave this component a ~120px-wide column while
   * the pie used fixed pixel radii (innerRadius=40/outerRadius=65, a 130px
   * diameter) — the ring rendered clipped to a sliver with the legend
   * overlapping it. Radii are percentage-based now so the ring always scales
   * to whatever box it's actually given; the legend (redundant with the %
   * number below) is gone rather than fixed, since two data points don't
   * need one.
   */
}

// Hand-rolled SVG donut ring — replaces a recharts <PieChart> that pulled in
// ~9MB of d3-* transitive deps for a two-segment ring. Geometry mirrors the
// previous recharts config: innerRadius 65% / outerRadius 100% of the box's
// half-min-dimension, 2deg padding angle, starting at 12 o'clock going
// clockwise (recharts startAngle=90/endAngle=-270).
export function CpuRamGauge({ value, max = 100, label, color = 'var(--accent-info)', height = 150 }: CpuRamGaugeProps) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100))

  // Determine color based on percentage
  let fillColor = color
  if (percentage >= 80) {
    fillColor = 'var(--accent-critical)'
  } else if (percentage >= 60) {
    fillColor = 'var(--accent-warn)'
  }

  const size = 100 // viewBox units, scales via the wrapping div's height
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2
  const innerR = outerR * 0.65
  const strokeWidth = outerR - innerR
  const radius = (outerR + innerR) / 2 // path radius for a stroke-based ring
  const circumference = 2 * Math.PI * radius

  // recharts paddingAngle=2 puts a 2deg gap at EVERY segment boundary — with
  // 2 segments arranged in a full circle that's 2 boundaries, so 2 gaps.
  // Subtracting a full `gap` from each segment (not gap/2) reproduces both:
  // one between used→available, one on the available→used wrap-around.
  const gap = circumference * (2 / 360)
  const usedLen = Math.max(0, (percentage / 100) * circumference - gap)
  const availLen = Math.max(0, circumference - (percentage / 100) * circumference - gap)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
      <div style={{ position: 'relative', width: '100%', height }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" style={{ display: 'block' }}>
          {/* Available (background) segment */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--bg-3)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${availLen} ${circumference - availLen}`}
            strokeDashoffset={-(usedLen + gap)}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
          {/* Used segment */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={fillColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${usedLen} ${circumference - usedLen}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: fillColor }}>
            {percentage.toFixed(0)}%
          </span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}
