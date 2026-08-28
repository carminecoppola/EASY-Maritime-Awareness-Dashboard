import { useMemo } from 'react'
import { useSharedDashboardState } from '../../hooks/DashboardStateContext'
import { StatusBadge } from '../status/StatusBadge'
import { toneForAvailability } from '../status/severityColors'
import type { Tone } from '../status/severityColors'

function connectionTone(loading: boolean, hasError: boolean, ok: boolean | undefined): { tone: Tone; text: string } {
  if (hasError) return { tone: { color: 'var(--accent-critical)', dim: 'var(--accent-critical-dim)', label: '' }, text: 'DISCONNECTED' }
  if (loading) return { tone: { color: 'var(--text-muted)', dim: 'var(--bg-3)', label: '' }, text: 'CONNECTING' }
  if (ok) return { tone: { color: 'var(--accent-ok)', dim: 'var(--accent-ok-dim)', label: '' }, text: 'LIVE' }
  return { tone: { color: 'var(--accent-warn)', dim: 'var(--accent-warn-dim)', label: '' }, text: 'DEGRADED' }
}

export function TopBar() {
  const { data, error, loading } = useSharedDashboardState()

  const connection = useMemo(
    () => connectionTone(loading, Boolean(error), data?.ok),
    [loading, error, data?.ok],
  )

  const criticalCount =
    data?.events_current?.events?.filter((e) => e.status !== 'RESOLVED' && e.severity === 'CRITICAL').length ?? 0
  const rgb = data?.health?.runtime_state?.rgb
  const thermal = data?.health?.runtime_state?.thermal

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-5)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <StatusBadge tone={connection.tone} text={connection.text} />
        {rgb && <StatusBadge tone={toneForAvailability(rgb.availability)} text={`RGB ${rgb.availability}`} />}
        {thermal && <StatusBadge tone={toneForAvailability(thermal.availability)} text={`THERMAL ${thermal.availability}`} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {criticalCount > 0 && (
          <StatusBadge
            tone={{ color: 'var(--accent-critical)', dim: 'var(--accent-critical-dim)', label: '' }}
            text={`${criticalCount} CRITICAL`}
          />
        )}
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {data?.session?.running ? `Session: ${data.session.current?.session_id ?? 'active'}` : 'No active session'}
        </span>
      </div>
    </header>
  )
}
