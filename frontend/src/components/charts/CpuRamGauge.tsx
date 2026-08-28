import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts'

interface CpuRamGaugeProps {
  value: number
  max?: number
  label: string
  color?: string
  height?: number
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
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={65}
            paddingAngle={2}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
          >
            <Cell fill={fillColor} />
            <Cell fill="var(--bg-3)" />
          </Pie>
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: fillColor }}>
          {percentage.toFixed(0)}%
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
          {label}
        </div>
      </div>
    </div>
  )
}
