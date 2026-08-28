import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export interface SparklineData {
  timestamp: number
  [key: string]: number | string
}

interface SparklineProps {
  data: SparklineData[]
  dataKey: string
  label?: string
  color?: string
  height?: number
  yMin?: number
  yMax?: number
  showGrid?: boolean
}

export function Sparkline({ data, dataKey, label, color = 'var(--accent-info)', height = 200, yMin = 0, yMax = 100, showGrid = true }: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />}
        <XAxis dataKey="timestamp" hide />
        <YAxis domain={[yMin, yMax]} width={40} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
          }}
          labelFormatter={(ts) => {
            const date = new Date(typeof ts === 'number' ? ts : 0)
            return date.toLocaleTimeString()
          }}
          formatter={(value) => [
            `${typeof value === 'number' ? value.toFixed(1) : value}${label ? ` ${label}` : ''}`,
            dataKey,
          ]}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          dot={false}
          strokeWidth={2}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
