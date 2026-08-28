import { StatusCard } from '../status/StatusCard'
import { toneForAvailability } from '../status/severityColors'
import type { ThermalStatusResponse } from '../../api/types'

interface ThermalStatusPanelProps {
  status: ThermalStatusResponse | null
  loading: boolean
  error: unknown
}

export function ThermalStatusPanel({ status, loading, error }: ThermalStatusPanelProps) {
  if (loading && !status) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        Loading thermal status...
      </div>
    )
  }

  if (error && !status) {
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
        Failed to load thermal status: {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  if (!status) {
    return (
      <div
        style={{
          padding: 'var(--space-3)',
          background: 'var(--accent-warn-dim)',
          border: '1px solid var(--accent-warn)',
          borderRadius: 'var(--radius-md)',
          fontSize: 12,
          color: 'var(--accent-warn)',
        }}
      >
        Thermal status unavailable
      </div>
    )
  }

  const rt = status.runtime_state
  const tone = toneForAvailability(rt.availability)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
      <StatusCard
        title="Availability"
        value={rt.availability}
        tone={tone}
      />
      <StatusCard
        title="Detection"
        value={rt.detected ? 'Detected' : 'Not detected'}
        tone={rt.detected ? { color: 'var(--accent-warn)', dim: 'var(--accent-warn-dim)', label: 'DETECTED' } : { color: 'var(--text-muted)', dim: 'var(--bg-3)', label: '—' }}
      />
      <StatusCard
        title="Device"
        value={(status.device as string) || 'N/A'}
        hint={`Method: ${(status.discovery_method as string) || 'unknown'}`}
      />
      {status.error ? (
        <StatusCard
          title="Error"
          value="Present"
          tone={{ color: 'var(--accent-critical)', dim: 'var(--accent-critical-dim)', label: 'ERROR' }}
          hint={String(status.error as unknown)}
        />
      ) : null}
    </div>
  )
}
