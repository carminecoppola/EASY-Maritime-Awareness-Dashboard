import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { ReadinessStrip } from '../components/live/ReadinessStrip'
import { ThermalReadinessPanel } from '../components/live/ThermalReadinessPanel'
import { ActivityTimeline } from '../components/live/ActivityTimeline'
import { MissionBar } from '../components/live/MissionBar'
import { VideoPanel } from '../components/video/VideoPanel'
import { Collapsible } from '../components/common/Collapsible'
import { StatusBadge } from '../components/status/StatusBadge'
import { toneForHardwareState } from '../components/status/severityColors'
import { sensorReadiness } from '../lib/readiness'
import { mostRecentFirst } from '../utils/sorting'
import { formatRelativeTime, toDate } from '../utils/formatTime'
import type { Availability, RawLogEvent, RgbCamera } from '../api/types'

/** Telemetria reale per lato, dall'inventario camere; assente = nessun chip. */
function cameraFor(cameras: RgbCamera[], side: 'left' | 'right'): RgbCamera | undefined {
  return cameras.find((camera) => String(camera.logical_name || '').toLowerCase().includes(side))
}

export function LiveOverviewPage() {
  const { data, loading, error } = useSharedDashboardState()
  const [now, setNow] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)

  // Un solo tick al secondo per la durata missione: il resto della pagina
  // si aggiorna col polling condiviso, non con timer locali.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading && !data) {
    return (
      <p className="easy-empty" style={{ marginTop: 0 }}>
        <span className="easy-shimmer">Connecting to backend…</span>
      </p>
    )
  }
  if (error && !data) {
    return (
      <div className="easy-panel">
        <h2 style={{ margin: 0, fontSize: 16 }}>Unable to reach the backend</h2>
        <p className="easy-sub">
          The dashboard could not load any state. Technical detail: {String(error)}
        </p>
      </div>
    )
  }

  const sensors = sensorReadiness(data ?? null)
  const leftSensor = sensors[0]
  const rightSensor = sensors[1]

  const cameras = ((data?.health?.cameras as { rgb_cameras?: RgbCamera[] } | undefined)?.rgb_cameras ?? []) as RgbCamera[]
  const leftCamera = cameraFor(cameras, 'left')
  const rightCamera = cameraFor(cameras, 'right')

  const detections = data?.detections
  const devices = (data?.devices?.devices ?? []) as Record<string, any>[]
  const sources = data?.sources?.sources ?? []

  const rawEvents = (data?.events?.events ?? []) as RawLogEvent[]
  // /events è restituito dal più vecchio al più recente (verificato su un
  // payload reale): senza riordino "recent activity" mostrava eventi di
  // settimane prima invece di quanto appena accaduto.
  const recentEvents = mostRecentFirst(rawEvents)

  const lastUpdate = toDate(data?.timestamp)

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([api.refreshDevices(), api.refreshSources()])
    } catch {
      // Il polling condiviso riporta comunque lo stato reale al tick
      // successivo: un refresh fallito non deve bloccare la pagina.
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Real-time monitoring</div>
          <h1>Live Operations</h1>
          <p>Monitor camera feeds, sensor readiness and recent activity.</p>
        </div>
        <div className="easy-updated">
          {error ? (
            <>
              Connection lost — showing last state from <b>{lastUpdate ? formatRelativeTime(lastUpdate) : 'unknown'}</b>
            </>
          ) : (
            <>
              Last synchronized update <b>{lastUpdate ? formatRelativeTime(lastUpdate) : 'unknown'}</b>
            </>
          )}
        </div>
      </section>

      <ReadinessStrip data={data ?? null} now={now} />

      <div className="easy-sectionhead">
        <h2>Live RGB feeds</h2>
        <div className="easy-actions">
          <button type="button" className="easy-btn mini" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh status'}
          </button>
        </div>
      </div>

      <section className="easy-feeds">
        <VideoPanel
          feed="rgb_left"
          label="RGB Left"
          availability={leftSensor.availability as Availability}
          detections={detections?.detections}
          fps={leftCamera?.fps ?? null}
          lastAcquisitionTs={leftCamera?.last_acquisition_ts ?? null}
          cameraError={leftCamera?.error ?? null}
        />
        <VideoPanel
          feed="rgb_right"
          label="RGB Right"
          availability={rightSensor.availability as Availability}
          detections={detections?.detections}
          fps={rightCamera?.fps ?? null}
          lastAcquisitionTs={rightCamera?.last_acquisition_ts ?? null}
          cameraError={rightCamera?.error ?? null}
        />
      </section>

      <section className="easy-lower">
        <ThermalReadinessPanel data={data ?? null} />
        <ActivityTimeline events={recentEvents} loading={loading} error={Boolean(error)} />
      </section>

      <div style={{ marginTop: 'var(--space-3)' }}>
        <Collapsible title="Device & source inventory" defaultOpen={false}>
          <div className="easy-lower" style={{ marginTop: 0 }}>
            <article className="easy-panel">
              <div className="easy-kicker">Devices ({devices.length})</div>
              {devices.length === 0 ? (
                <p className="easy-empty">No devices reported.</p>
              ) : (
                <div className="easy-events">
                  {devices.map((device) => (
                    <div
                      key={String(device.device_id)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', gap: 8 }}
                    >
                      <span style={{ fontSize: 12 }}>{String(device.device_name)}</span>
                      <StatusBadge tone={toneForHardwareState(String(device.health))} text={String(device.health)} />
                    </div>
                  ))}
                </div>
              )}
            </article>
            <article className="easy-panel">
              <div className="easy-kicker">Sources ({sources.length})</div>
              {sources.length === 0 ? (
                <p className="easy-empty">No sources reported.</p>
              ) : (
                <div className="easy-events">
                  {sources.map((source) => (
                    <div key={source.id} className="mono" style={{ fontSize: 12, padding: '6px 0' }}>
                      {source.id}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </Collapsible>
      </div>

      <MissionBar data={data ?? null} now={now} />
    </>
  )
}
