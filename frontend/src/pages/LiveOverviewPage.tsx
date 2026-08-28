import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { StatusCard } from '../components/status/StatusCard'
import { toneForAvailability } from '../components/status/severityColors'

export function LiveOverviewPage() {
  const { data, loading, error } = useSharedDashboardState()

  if (loading && !data) {
    return <p style={{ color: 'var(--text-muted)' }}>Connessione al backend in corso…</p>
  }
  if (error && !data) {
    return <p style={{ color: 'var(--accent-critical)' }}>Impossibile raggiungere il backend: {String(error)}</p>
  }

  const rgb = data?.health?.runtime_state?.rgb
  const thermal = data?.health?.runtime_state?.thermal
  const detections = data?.detections

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 18 }}>Live Overview</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {rgb && (
          <StatusCard title="RGB Feed" value={rgb.availability} tone={toneForAvailability(rgb.availability)} toneText={rgb.availability} />
        )}
        {thermal && (
          <StatusCard
            title="Thermal"
            value={thermal.availability}
            tone={toneForAvailability(thermal.availability)}
            toneText={thermal.availability}
          />
        )}
        <StatusCard title="Detections" value={detections?.count ?? 0} hint={detections?.last_run_ts ?? undefined} />
        <StatusCard title="Session" value={data?.session?.running ? 'RUNNING' : 'STOPPED'} />
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Video panel, overlay detection e feed eventi arrivano nella Fase 1 del redesign.
      </p>
    </div>
  )
}
