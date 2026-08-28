import { useCallback, useState } from 'react'
import { ThermalStatusPanel } from '../components/thermal/ThermalStatusPanel'
import { ThermalFrameViewer } from '../components/thermal/ThermalFrameViewer'
import { DetectionHistory } from '../components/thermal/DetectionHistory'
import { ThermalSnapshotAction } from '../components/thermal/ThermalSnapshotAction'
import { useThermalStatus } from '../hooks/useThermal'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

export function ThermalEventsPage() {
  const thermalStatus = useThermalStatus(3000)
  const detectionHistory = usePolling(() => api.getDetectionHistory(), { intervalMs: 5000 })
  const [refreshKey, setRefreshKey] = useState(0)

  const handleSnapshotTaken = useCallback(() => {
    // Trigger refresh
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Thermal & Events
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0 0' }}>
          Stato fotocamera termica, frame live e storico detection
        </p>
      </div>

      {/* Sezione Stato Termico */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Stato Fotocamera Termica
        </div>
        <ThermalStatusPanel
          status={thermalStatus.data}
          loading={thermalStatus.loading}
          error={thermalStatus.error}
        />
      </div>

      {/* Sezione Frame Termico */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Frame Termico Live
        </div>
        <ThermalFrameViewer enableAutoPolling={true} key={refreshKey} />
      </div>

      {/* Sezione Snapshot Termico Manuale */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Acquisizione Snapshot
        </div>
        <ThermalSnapshotAction onSnapshotTaken={handleSnapshotTaken} key={refreshKey} />
      </div>

      {/* Sezione Storico Detection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Storico Detection
        </div>
        <div
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <DetectionHistory
            detections={detectionHistory.data?.detections || []}
            loading={detectionHistory.loading}
            error={detectionHistory.error}
          />
        </div>
      </div>
    </div>
  )
}
