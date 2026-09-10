import { useMemo, useState } from 'react'

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

const VIEW_WIDTH = 400
const MARGIN = { top: 5, right: 10, left: 40, bottom: 5 }
const Y_AXIS_TICKS = 5

// Hand-rolled SVG line chart — replaces a recharts <LineChart> that pulled in
// ~9MB of d3-* transitive deps for a single line + grid + tooltip. Keeps the
// same visual layout: a left-side numeric axis, dashed gridlines, and a
// hover tooltip showing the value + formatted time.
export function Sparkline({ data, dataKey, label, color = 'var(--accent-info)', height = 200, yMin = 0, yMax = 100, showGrid = true }: SparklineProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const innerWidth = VIEW_WIDTH - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const points = useMemo(() => {
    if (data.length === 0) return []
    const range = yMax - yMin || 1
    return data.map((d, i) => {
      const x = MARGIN.left + (data.length === 1 ? 0 : (i / (data.length - 1)) * innerWidth)
      const rawValue = d[dataKey]
      const value = typeof rawValue === 'number' ? rawValue : 0
      const clamped = Math.max(yMin, Math.min(yMax, value))
      const y = MARGIN.top + innerHeight - ((clamped - yMin) / range) * innerHeight
      return { x, y, value, timestamp: d.timestamp }
    })
  }, [data, dataKey, yMin, yMax, innerWidth, innerHeight])

  const linePath = points.length > 0 ? 'M' + points.map((p) => `${p.x},${p.y}`).join(' L') : ''

  const yTicks = useMemo(() => {
    const ticks: number[] = []
    for (let i = 0; i < Y_AXIS_TICKS; i++) {
      ticks.push(yMin + ((yMax - yMin) * i) / (Y_AXIS_TICKS - 1))
    }
    return ticks
  }, [yMin, yMax])

  const hovered = hoverIndex !== null ? points[hoverIndex] : null

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length === 0) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const scale = VIEW_WIDTH / rect.width
    const mouseX = (e.clientX - rect.left) * scale
    let closest = 0
    let closestDist = Infinity
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX)
      if (dist < closestDist) {
        closestDist = dist
        closest = i
      }
    })
    setHoverIndex(closest)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {showGrid &&
          yTicks.map((tick, i) => {
            const y = MARGIN.top + innerHeight - ((tick - yMin) / ((yMax - yMin) || 1)) * innerHeight
            return (
              <line
                key={i}
                x1={MARGIN.left}
                x2={VIEW_WIDTH - MARGIN.right}
                y1={y}
                y2={y}
                stroke="var(--border-subtle)"
                strokeDasharray="3 3"
              />
            )
          })}

        {yTicks.map((tick, i) => {
          const y = MARGIN.top + innerHeight - ((tick - yMin) / ((yMax - yMin) || 1)) * innerHeight
          return (
            <text key={i} x={MARGIN.left - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--text-muted)">
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          )
        })}

        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={2} />}

        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={MARGIN.top}
            y2={height - MARGIN.bottom}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
        )}
        {hovered && <circle cx={hovered.x} cy={hovered.y} r={3} fill={color} />}
      </svg>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: Math.min(Math.max((hovered.x / VIEW_WIDTH) * 100, 10), 90) + '%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            padding: '4px 8px',
            fontSize: 11,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <div>{new Date(hovered.timestamp).toLocaleTimeString()}</div>
          <div>
            {typeof hovered.value === 'number' ? hovered.value.toFixed(1) : hovered.value}
            {label ? ` ${label}` : ''} ({dataKey})
          </div>
        </div>
      )}
    </div>
  )
}
