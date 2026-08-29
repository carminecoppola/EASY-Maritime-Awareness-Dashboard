import { StatusBadge } from '../status/StatusBadge'
import { toneForEventStatus } from '../status/severityColors'
import { formatTimestampWithRelative } from '../../utils/formatTime'
import type { Detection } from '../../api/types'

interface DetectionHistoryProps {
  detections: Detection[]
  loading: boolean
  error: unknown
}

export function DetectionHistory({ detections, loading, error }: DetectionHistoryProps) {
  if (loading && detections.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 'var(--space-3)' }}>
        Loading detection history...
      </div>
    )
  }

  if (error && detections.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--space-3)',
          background: 'var(--accent-critical-dim)',
          border: '1px solid var(--accent-critical)',
          borderRadius: 'var(--radius-md)',
          fontSize: 12,
          color: 'var(--accent-critical)',
        }}
      >
        Failed to load history: {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  if (detections.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 'var(--space-3)', textAlign: 'center' }}>
        No AI detections yet
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 11,
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Timestamp
            </th>
            <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Source
            </th>
            <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Class
            </th>
            <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Confidence
            </th>
            <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {detections.map((detection) => (
            <tr
              key={detection.id}
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-3)',
              }}
            >
              <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)', fontSize: 11 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {formatTimestampWithRelative(detection.timestamp)}
                </div>
              </td>
              <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)' }}>
                {detection.source_label || detection.source}
              </td>
              <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)' }}>
                {detection.class_name}
              </td>
              <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)' }}>
                {(detection.confidence * 100).toFixed(0)}%
              </td>
              <td style={{ padding: 'var(--space-2)' }}>
                <StatusBadge
                  tone={toneForEventStatus(detection.status)}
                  text={detection.status}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
