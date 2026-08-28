import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { StatusCard } from '../components/status/StatusCard'
import { StatusBadge } from '../components/status/StatusBadge'
import { toneForHardwareState } from '../components/status/severityColors'
import { VideoPanel } from '../components/video/VideoPanel'
import { EventsTable, type EventTableRow } from '../components/events/EventsTable'
import { Collapsible } from '../components/common/Collapsible'
import { mostRecentFirst } from '../utils/sorting'
import type { DeviceInfo } from '../api/types'

export function LiveOverviewPage() {
  const { data, loading, error } = useSharedDashboardState()

  if (loading && !data) {
    return <p style={{ color: 'var(--text-muted)' }}>Connecting to backend…</p>
  }
  if (error && !data) {
    return <p style={{ color: 'var(--accent-critical)' }}>Unable to reach the backend: {String(error)}</p>
  }

  const rgb = data?.health?.runtime_state?.rgb
  const detections = data?.detections
  const devices = data?.devices?.devices || []
  const sources = data?.sources?.sources || []
  const rawEvents = data?.events?.events || []
  const missionEvents = data?.events_current?.events || []

  // Convert raw events to EventTableRow format. /events is returned oldest
  // first (verified against a real payload: index 0 was 25 days older than
  // the last entry) — without re-sorting, "recent activity" showed events
  // from weeks ago instead of what just happened.
  const activityLogRows: EventTableRow[] = mostRecentFirst(
    rawEvents.map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      label: event.description,
      severity_or_status: event.severity,
      description: event.action || event.type,
    })),
  )

  // Convert mission events to EventTableRow format
  const missionEventRows: EventTableRow[] = mostRecentFirst(
    missionEvents.map((event) => ({
      id: event.event_id,
      timestamp: event.created_at,
      label: event.type,
      severity_or_status: event.severity,
      description: event.track_id ? `Track ${event.track_id}` : undefined,
    })),
  )

  // Extract RGB devices for status
  const rgbLeftDevice = devices.find((d: DeviceInfo) => 'feed' in d && (d as any).feed === 'rgb_left') as any
  const rgbRightDevice = devices.find((d: DeviceInfo) => 'feed' in d && (d as any).feed === 'rgb_right') as any

  const rgbLeftAvailability = rgbLeftDevice?.runtime_state?.availability || rgb?.availability || 'NOT_PRESENT'
  const rgbRightAvailability = rgbRightDevice?.runtime_state?.availability || rgb?.availability || 'NOT_PRESENT'

  const devicesOnline = devices.filter((d: any) => d.health !== 'OFFLINE').length
  const rgbStatus = rgbLeftAvailability === 'ONLINE' && rgbRightAvailability === 'ONLINE'
    ? 'Streaming'
    : 'Degraded'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 18 }}>Live Overview</h1>

      {/* PRIMARY: Status Summary — what matters right now */}
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'var(--bg-2)',
          border: '2px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Status Summary
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <StatusCard
            title="Devices Online"
            value={`${devicesOnline}/${devices.length}`}
          />
          <StatusCard
            title="Video Stream"
            value={rgbStatus}
          />
          <StatusCard title="Session" value={data?.session?.running ? 'RUNNING' : 'STOPPED'} />
          <StatusCard
            title="Detections"
            value={detections?.count ?? 0}
            hint={detections?.last_run_ts ? `Last: ${new Date(detections.last_run_ts).toLocaleTimeString()}` : undefined}
          />
        </div>
      </div>

      {/* Video feeds with detection overlays */}
      <div>
        <h2 style={{ margin: '0 0 var(--space-3) 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Live Feeds
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <VideoPanel
            feed="rgb_left"
            label="RGB LEFT"
            availability={rgbLeftAvailability as any}
            detections={detections?.detections}
          />
          <VideoPanel
            feed="rgb_right"
            label="RGB RIGHT"
            availability={rgbRightAvailability as any}
            detections={detections?.detections}
          />
        </div>
      </div>

      {/* Inference metrics */}
      <div>
        <h2 style={{ margin: '0 0 var(--space-3) 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Inference Performance
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <StatusCard
            title="Framerate"
            value={detections?.fps ? `${detections.fps.toFixed(1)} FPS` : 'N/A'}
            hint={detections?.last_inference_ms ? `${detections.last_inference_ms}ms` : undefined}
          />
        </div>
      </div>

      {/* SECONDARY: Device and source inventory (collapsible) */}
      <Collapsible title="Device & Source Inventory" defaultOpen={false}>
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
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No devices</p>
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
                    <StatusBadge tone={toneForHardwareState(device.health)} text={device.health} />
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
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No sources</p>
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
      </Collapsible>

      {/* Activity logs and events */}
      <div>
        <h2 style={{ margin: '0 0 var(--space-3) 0', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Activity
        </h2>
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
    </div>
  )
}
