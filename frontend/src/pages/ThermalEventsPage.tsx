import { ThermalStatusPanel } from '../components/thermal/ThermalStatusPanel'
import { ThermalFrameViewer } from '../components/thermal/ThermalFrameViewer'
import { DetectionHistory } from '../components/thermal/DetectionHistory'
import { ThermalSnapshotAction } from '../components/thermal/ThermalSnapshotAction'
import { useThermalStatus } from '../hooks/useThermal'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

export function ThermalEventsPage() {
  const thermalStatus = useThermalStatus(3000)
  // Il proprio storico si aggiorna già da solo via polling (5s): non serve
  // forzare un remount dopo uno snapshot manuale. Prima invece
  // ThermalSnapshotAction veniva rimontato via `key` subito dopo aver
  // chiamato la sua stessa callback di successo, distruggendo il proprio
  // messaggio "Thermal snapshot captured" a metà del proprio handler.
  const detectionHistory = usePolling(() => api.getDetectionHistory(), { intervalMs: 5000 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Thermal & Events
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0 0' }}>
          Thermal camera status, live frame, and detection history
        </p>
      </div>

      {/* Sezione Stato Termico */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Thermal Camera Status
        </div>
        <ThermalStatusPanel
          status={thermalStatus.data}
          loading={thermalStatus.loading}
          error={thermalStatus.error}
        />
      </div>

      {/* Sezione Frame Termico — il viewer e l'azione di salvataggio erano
          due sezioni separate con la propria intestazione, pur essendo
          entrambe azioni sullo stesso frame corrente; ora è un unico blocco
          coerente, con "Save Snapshot" chiaramente secondario rispetto al
          "Capture Now" del viewer. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Live Thermal Frame
        </div>
        <ThermalFrameViewer enableAutoPolling={true} />
        <ThermalSnapshotAction />
      </div>

      {/* Sezione Detection History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Detection History
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
