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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Thermal Events
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0 0' }}>
          Capture and review thermal readings; the AI detection log below covers all sources, not just this sensor.
        </p>
      </div>

      {/* PRIMARY: Live Thermal Frame & Capture Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ margin: '0 0 var(--space-3) 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Live Thermal Frame
        </h2>
        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <ThermalFrameViewer enableAutoPolling={true} />
          <ThermalSnapshotAction />
        </div>
      </div>

      {/* SECONDARY: Thermal Camera Status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ margin: '0 0 var(--space-3) 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Thermal Camera Status
        </h2>
        <ThermalStatusPanel
          status={thermalStatus.data}
          loading={thermalStatus.loading}
          error={thermalStatus.error}
        />
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
          This sensor and the RGB cameras use independent hardware paths — capturing a thermal reading never pauses
          or interrupts the RGB feeds.
        </p>
      </div>

      {/* TERTIARY: AI Detection Log — this table shows api.getDetectionHistory(),
          the same AI/inference detection feed used elsewhere in the app
          (boat/ship/buoy from the ONNX model on RGB or replay frames), not
          thermal-sensor-specific events. It was labeled "Detection History"
          with no qualifier, on a page titled "Thermal Events" — reads as
          thermal data when it isn't. Renamed and captioned instead of
          removed, since it's genuinely useful, just mislabeled. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ margin: '0 0 var(--space-1) 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          AI Detection Log
        </h2>
        <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Every AI detection across the app (any camera source, not exclusive to thermal) — see the Source column.
        </p>
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
