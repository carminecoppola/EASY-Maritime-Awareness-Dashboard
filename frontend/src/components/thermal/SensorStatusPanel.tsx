import type { ThermalStatusResponse } from '../../api/types'

interface SensorStatusPanelProps {
  status: ThermalStatusResponse | null
  loading: boolean
  error: unknown
}

function sensorName(status: ThermalStatusResponse | null): string {
  const candidates = (status?.device_candidates ?? []) as { path?: string; name?: string; selected?: boolean }[]
  const selected = candidates.find((c) => c.selected) ?? candidates[0]
  // v4l2-ctl restituisce stringhe prolisse come
  // "PureThermal (fw:v1.3.0): PureTh (usb-0000:01:00.0-1.3):" — si tiene il
  // nome del modulo, scartando firmware e percorso USB fra parentesi.
  const raw = selected?.name
  if (!raw) return 'Thermal sensor'
  return raw.replace(/\s*\(.*$/, '').trim() || 'Thermal sensor'
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function SensorStatusPanel({ status, loading, error }: SensorStatusPanelProps) {
  const availability = status?.runtime_state?.availability ?? 'NOT_PRESENT'
  const online = availability === 'READY' || availability === 'STREAMING'
  const hotspot = number(status?.hotspot_percent)
  const spread = number(status?.signal_spread)
  const threshold = number(status?.threshold_celsius)
  const delta = number(status?.delta_threshold)
  const cpuLimit = number(status?.cpu_temperature_limit)
  const anomaly = Boolean(status?.anomaly_active)

  return (
    <aside className="easy-surface">
      <div className="easy-panelhead">
        <h2>Sensor status</h2>
        <span className="easy-panelnote">Live telemetry</span>
      </div>

      <div className="easy-statusbody">
        {error ? (
          <p className="easy-error" style={{ marginTop: 0 }}>
            Thermal status unavailable — the sensor could not be queried.
          </p>
        ) : null}

        <div className="easy-sensortop">
          <div className="easy-sensoricon" aria-hidden>
            TH
          </div>
          <div style={{ minWidth: 0 }}>
            <b>{loading && !status ? 'Reading sensor…' : sensorName(status)}</b>
            <small className="mono">
              {status?.device ?? 'device unknown'}
              {status?.discovery_method ? ` · ${status.discovery_method}` : ''}
            </small>
          </div>
          <span
            className="easy-tag"
            style={{ color: online ? 'var(--accent-ok)' : availability === 'ERROR' ? 'var(--accent-critical)' : 'var(--text-muted)' }}
          >
            {availability.replace('_', ' ')}
          </span>
        </div>

        <div className="easy-tiles" style={{ marginTop: 11 }}>
          <div className="easy-tile">
            <b>{String(status?.video_size ?? '—')}</b>
            <span>Capture resolution</span>
          </div>
          <div className="easy-tile">
            <b>{String(status?.input_format ?? '—').toUpperCase()}</b>
            <span>Pixel format</span>
          </div>
          <div className="easy-tile">
            <b>{hotspot !== null ? `${hotspot.toFixed(2)}%` : '—'}</b>
            <span>Hotspot coverage</span>
          </div>
          <div className="easy-tile">
            <b>{spread !== null ? spread.toFixed(0) : '—'}</b>
            <span>Signal spread (raw)</span>
          </div>
        </div>

        {/* Soglie di configurazione, in sola lettura: il backend non espone un
            endpoint per modificarle, quindi niente interruttori che non
            cambierebbero nulla. */}
        <h3 className="easy-sectiontitle">Configured alert thresholds</h3>
        <div className="easy-rule" style={{ color: anomaly ? 'var(--accent-warn)' : 'var(--text-muted)' }}>
          <i aria-hidden />
          <div>
            <b>Hot area threshold</b>
            <small>{anomaly ? 'Anomaly currently active' : 'No anomaly reported'}</small>
          </div>
          <span className="easy-rulevalue">{threshold !== null ? `${threshold.toFixed(1)}°C` : '—'}</span>
        </div>
        <div className="easy-rule" style={{ color: 'var(--accent-info)' }}>
          <i aria-hidden />
          <div>
            <b>Frame-to-frame delta</b>
            <small>Raised when a frame changes abruptly</small>
          </div>
          <span className="easy-rulevalue">{delta !== null ? `${delta.toFixed(1)}°C` : '—'}</span>
        </div>
        <div className="easy-rule" style={{ color: 'var(--accent-warn)' }}>
          <i aria-hidden />
          <div>
            <b>CPU temperature limit</b>
            <small>Capture is held back above this value</small>
          </div>
          <span className="easy-rulevalue">{cpuLimit !== null ? `${cpuLimit.toFixed(1)}°C` : '—'}</span>
        </div>

        <p className="easy-independent">
          Thermal capture never pauses the RGB feeds: sensor acquisition and RGB inference use independent hardware
          paths.
        </p>
      </div>
    </aside>
  )
}
