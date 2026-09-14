import { useCallback, useState } from 'react'
import { useThermalStatus } from '../hooks/useThermal'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { ThermalViewerPanel } from '../components/thermal/ThermalViewerPanel'
import { SensorStatusPanel } from '../components/thermal/SensorStatusPanel'
import { EventStream, buildStream } from '../components/thermal/EventStream'
import { formatRelativeTime, toDate } from '../utils/formatTime'
import type { MissionEvent, RawLogEvent } from '../api/types'

export function ThermalEventsPage() {
  const thermal = useThermalStatus(3000)
  const dashboard = useSharedDashboardState()
  // Incrementato dopo una cattura manuale: forza un nuovo ciclo del viewer
  // senza rimontare i pannelli vicini.
  const [, setCaptureCount] = useState(0)
  const handleCaptured = useCallback(() => setCaptureCount((n) => n + 1), [])

  const status = thermal.data
  const availability = status?.runtime_state?.availability ?? 'NOT_PRESENT'
  const online = availability === 'READY' || availability === 'STREAMING'
  const lastFrameAt = toDate(status?.last_frame_ts as number | string | undefined)

  const hotspot = typeof status?.hotspot_percent === 'number' ? status.hotspot_percent : null
  const spread = typeof status?.signal_spread === 'number' ? status.signal_spread : null

  const logEvents = (dashboard.data?.events?.events ?? []) as RawLogEvent[]
  const missionEvents = (dashboard.data?.events_current?.events ?? []) as MissionEvent[]
  const stream = buildStream(logEvents, missionEvents)
  const thermalCount = stream.filter((e) => e.kind === 'thermal').length
  const aiCount = stream.filter((e) => e.kind === 'ai').length

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Sensor intelligence</div>
          <h1>Thermal &amp; Events</h1>
          <p>Inspect the thermal sensor, capture evidence and review cross-source events.</p>
        </div>
        <div className="easy-updated">
          Last frame <b>{lastFrameAt ? formatRelativeTime(lastFrameAt) : 'never'}</b>
        </div>
      </section>

      <section className="easy-readiness" aria-label="Thermal summary">
        <div className="easy-readycell">
          <div className="easy-kicker">Thermal sensor</div>
          <div
            className="easy-value"
            style={{ color: online ? 'var(--accent-ok)' : availability === 'ERROR' ? 'var(--accent-critical)' : 'var(--text-muted)' }}
          >
            {online ? 'Operational' : availability.replace('_', ' ')}
          </div>
          <div className="easy-sub">Independent hardware path · on demand</div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Hotspot coverage</div>
          <div className="easy-value mono">{hotspot !== null ? `${hotspot.toFixed(2)}%` : '—'}</div>
          <div className="easy-sub">
            {status?.anomaly_active ? 'Anomaly active' : 'Share of the frame above threshold'}
          </div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Signal spread</div>
          <div className="easy-value mono">{spread !== null ? spread.toFixed(0) : '—'}</div>
          <div className="easy-sub">Raw sensor units, not °C</div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Events in stream</div>
          <div className="easy-value mono">{stream.length}</div>
          <div className="easy-sub">
            {thermalCount} thermal · {aiCount} AI
          </div>
        </div>
      </section>

      <section className="easy-workspace">
        <ThermalViewerPanel status={status} onCaptured={handleCaptured} />
        <SensorStatusPanel status={status} loading={thermal.loading} error={thermal.error} />
      </section>

      <EventStream
        events={stream}
        loading={dashboard.loading}
        error={Boolean(dashboard.error)}
      />
    </>
  )
}
