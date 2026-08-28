import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

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

export function CpuRamGauge({ value, max = 100, label, color = 'var(--accent-info)', height = 150 }: CpuRamGaugeProps) {
  const percentage = (value / max) * 100

  const data = [
    { name: 'Used', value: percentage },
    { name: 'Available', value: 100 - percentage },
  ]

  // Determine color based on percentage
  let fillColor = color
  if (percentage >= 80) {
    fillColor = 'var(--accent-critical)'
  } else if (percentage >= 60) {
    fillColor = 'var(--accent-warn)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
      <div style={{ position: 'relative', width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="100%"
              paddingAngle={2}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              <Cell fill={fillColor} />
              <Cell fill="var(--bg-3)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
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
