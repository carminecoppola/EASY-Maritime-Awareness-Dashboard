import type { DashboardState, SystemDiagnostics } from '../../api/types'
import { READINESS_COLOR, READINESS_LABEL, readinessLevel, sensorReadiness } from '../../lib/readiness'
import { elapsedSince } from '../../hooks/useMissionControl'

function sensorColor(ready: boolean, availability: string): string {
  if (ready) return 'var(--accent-ok)'
  if (availability === 'ERROR') return 'var(--accent-critical)'
  if (availability === 'INITIALIZING') return 'var(--accent-warn)'
  return 'var(--text-muted)'
}

function storageLabel(disk: SystemDiagnostics['disk'] | undefined) {
  if (!disk || typeof disk.free_gb !== 'number') return { value: 'Unavailable', sub: 'Disk usage not reported' }
  return {
    value: `${disk.free_gb.toFixed(1)} GB free`,
    sub: typeof disk.percent === 'number' ? `${(100 - disk.percent).toFixed(0)}% available` : 'Usage unknown',
  }
}

export function ReadinessStrip({ data, now }: { data: DashboardState | null; now: number }) {
  const sensors = sensorReadiness(data)
  const level = readinessLevel(sensors)

  const running = data?.session?.running ?? false
  const session = data?.session?.current ?? null
  const elapsed = elapsedSince(session?.start_time, now)

  const inference = data?.inference as { running?: boolean } | undefined
  const inferenceRunning = Boolean(inference?.running)
  const detectionCount = data?.detections?.count
  const lastRun = data?.detections?.last_run_ts

  const storage = storageLabel(data?.health?.system?.disk)

  return (
    <section className="easy-readiness" aria-label="System readiness">
      <div className="easy-readycell">
        <div className="easy-kicker">System readiness</div>
        <div className="easy-value" style={{ color: READINESS_COLOR[level] }}>
          {READINESS_LABEL[level]}
        </div>
        <div className="easy-sensorline">
          {sensors.map((sensor) => (
            <span key={sensor.key} title={`${sensor.label}: ${sensor.availability}`}>
              <i style={{ background: sensorColor(sensor.ready, sensor.availability) }} aria-hidden />
              {sensor.label}
            </span>
          ))}
        </div>
      </div>

      <div className="easy-readycell">
        <div className="easy-kicker">Mission</div>
        <div className="easy-value" style={{ color: running ? 'var(--accent-ok)' : undefined }}>
          {running ? (session?.session_id ?? 'Active') : 'Not started'}
        </div>
        <div className="easy-sub">{running ? `Active${elapsed ? ` · ${elapsed}` : ''}` : 'Monitoring only'}</div>
      </div>

      <div className="easy-readycell">
        <div className="easy-kicker">AI analysis</div>
        <div className="easy-value" style={{ color: inferenceRunning ? 'var(--accent-info)' : undefined }}>
          {inferenceRunning ? 'Running' : 'Idle'}
        </div>
        <div className="easy-sub">
          {typeof detectionCount === 'number'
            ? `${detectionCount} detection${detectionCount === 1 ? '' : 's'} in last result`
            : 'No detection result yet'}
          {lastRun ? ` · ${new Date(lastRun).toLocaleString()}` : ''}
        </div>
      </div>

      <div className="easy-readycell">
        <div className="easy-kicker">Storage</div>
        <div className="easy-value">{storage.value}</div>
        <div className="easy-sub">{storage.sub}</div>
      </div>
    </section>
  )
}
