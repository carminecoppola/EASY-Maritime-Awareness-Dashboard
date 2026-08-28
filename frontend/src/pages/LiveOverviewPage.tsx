import { useRef } from 'react'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { StatusCard } from '../components/status/StatusCard'
import { VideoPanel } from '../components/video/VideoPanel'
import { DetectionOverlay } from '../components/video/DetectionOverlay'
import { EventsTable, type EventTableRow } from '../components/events/EventsTable'
import type { DeviceInfo } from '../api/types'

export function LiveOverviewPage() {
  const { data, loading, error } = useSharedDashboardState()
  const rgbLeftContainerRef = useRef<HTMLDivElement>(null)
  const rgbRightContainerRef = useRef<HTMLDivElement>(null)

  if (loading && !data) {
    return <p style={{ color: 'var(--text-muted)' }}>Connessione al backend in corso…</p>
  }
  if (error && !data) {
    return <p style={{ color: 'var(--accent-critical)' }}>Impossibile raggiungere il backend: {String(error)}</p>
  }

  const rgb = data?.health?.runtime_state?.rgb
  const detections = data?.detections
  const devices = data?.devices?.devices || []
  const sources = data?.sources?.sources || []
  const rawEvents = data?.events?.events || []
  const missionEvents = data?.events_current?.events || []

  // Convert raw events to EventTableRow format
  const activityLogRows: EventTableRow[] = rawEvents.map((event) => ({
    id: event.id,
    timestamp: event.timestamp,
    label: event.description,
    severity_or_status: event.severity,
    description: event.action || event.type,
  }))

  // Convert mission events to EventTableRow format
  const missionEventRows: EventTableRow[] = missionEvents.map((event) => ({
    id: event.event_id,
    timestamp: event.created_at,
    label: event.type,
    severity_or_status: event.severity,
    description: event.track_id ? `Track ${event.track_id}` : undefined,
  }))

  // Extract RGB devices for status
  const rgbLeftDevice = devices.find((d: DeviceInfo) => 'feed' in d && (d as any).feed === 'rgb_left') as any
  const rgbRightDevice = devices.find((d: DeviceInfo) => 'feed' in d && (d as any).feed === 'rgb_right') as any

  const rgbLeftAvailability = rgbLeftDevice?.runtime_state?.availability || rgb?.availability || 'NOT_PRESENT'
  const rgbRightAvailability = rgbRightDevice?.runtime_state?.availability || rgb?.availability || 'NOT_PRESENT'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 18 }}>Live Overview</h1>

      {/* Video feeds with detection overlays */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {/* RGB Left Feed */}
        <div style={{ position: 'relative' }}>
          <div ref={rgbLeftContainerRef} style={{ position: 'relative' }}>
            <VideoPanel
              feed="rgb_left"
              label="RGB LEFT"
              availability={rgbLeftAvailability as any}
            />
            {/* Detection overlay only if streaming */}
            {rgbLeftAvailability !== 'ERROR' && rgbLeftAvailability !== 'NOT_PRESENT' && (
              <DetectionOverlay
                detections={detections?.detections || []}
                containerRef={rgbLeftContainerRef}
                sourceLabel="rgb_left"
              />
            )}
          </div>
        </div>

        {/* RGB Right Feed */}
        <div style={{ position: 'relative' }}>
          <div ref={rgbRightContainerRef} style={{ position: 'relative' }}>
            <VideoPanel
              feed="rgb_right"
              label="RGB RIGHT"
              availability={rgbRightAvailability as any}
            />
            {/* Detection overlay only if streaming */}
            {rgbRightAvailability !== 'ERROR' && rgbRightAvailability !== 'NOT_PRESENT' && (
              <DetectionOverlay
                detections={detections?.detections || []}
                containerRef={rgbRightContainerRef}
                sourceLabel="rgb_right"
              />
            )}
          </div>
        </div>
      </div>

      {/* Summary status cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <StatusCard
          title="Detections (Current)"
          value={detections?.count ?? 0}
          hint={detections?.last_run_ts ? `Last: ${new Date(detections.last_run_ts).toLocaleTimeString('it-IT')}` : undefined}
        />
        <StatusCard
          title="Inference"
          value={detections?.fps ? `${detections.fps.toFixed(1)} FPS` : 'N/A'}
          hint={detections?.last_inference_ms ? `${detections.last_inference_ms}ms` : undefined}
        />
        <StatusCard title="Session" value={data?.session?.running ? 'RUNNING' : 'STOPPED'} />
        <StatusCard
          title="Devices Online"
          value={`${devices.filter((d: any) => d.health !== 'OFFLINE').length}/${devices.length}`}
        />
      </div>

      {/* Devices & Sources Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {/* Devices */}
        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h3 style={{ margin: '0 0 var(--space-3) 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Devices ({devices.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {devices.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Nessun device</p>
            ) : (
              devices.map((device: any) => (
                <div
                  key={device.device_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                    padding: 'var(--space-2)',
                    background: 'var(--bg-1)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>{device.device_name}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background:
                        device.health === 'GOOD'
                          ? 'var(--accent-ok-dim)'
                          : device.health === 'OFFLINE'
                            ? 'var(--accent-critical-dim)'
                            : 'var(--accent-warn-dim)',
                      color:
                        device.health === 'GOOD'
                          ? 'var(--accent-ok)'
                          : device.health === 'OFFLINE'
                            ? 'var(--accent-critical)'
                            : 'var(--accent-warn)',
                    }}
                  >
                    {device.health}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sources */}
        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h3 style={{ margin: '0 0 var(--space-3) 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Sources ({sources.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {sources.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Nessuna source</p>
            ) : (
              sources.map((source: any) => (
                <div
                  key={source.id}
                  style={{
                    fontSize: 12,
                    padding: 'var(--space-2)',
                    background: 'var(--bg-1)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {source.id}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Activity Log & Mission Events Tables */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {/* Activity Log */}
        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <EventsTable rows={activityLogRows} title="Activity Log" maxRows={5} statusType="severity" />
        </div>

        {/* Mission Events */}
        {missionEventRows.length > 0 && (
          <div
            style={{
              padding: 'var(--space-4)',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <EventsTable rows={missionEventRows} title="Mission Events" maxRows={5} statusType="severity" />
          </div>
        )}
      </div>
    </div>
  )
}
