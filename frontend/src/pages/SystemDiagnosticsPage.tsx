import { useCallback, useEffect, useState } from 'react'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { api, ApiError } from '../api/client'
import { StatusBadge } from '../components/status/StatusBadge'
import { toneForHardwareState } from '../components/status/severityColors'
import { Sparkline, type SparklineData } from '../components/charts/Sparkline'
import { CpuRamGauge } from '../components/charts/CpuRamGauge'
import { Collapsible } from '../components/common/Collapsible'
import { authErrorMessage, roleAtLeast, useAuth } from '../hooks/AuthContext'
import { useStepUp } from '../components/feedback/StepUpProvider'
import { isStepUpRequiredBody } from '../api/types'
import type { CameraInventory } from '../api/types'

function RestartServicesPanel() {
  const auth = useAuth()
  const { runElevated } = useStepUp()
  const [restarting, setRestarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Fuori dall'enforcement (auth.user è nullo/nessun ruolo se non attivo)
  // il pulsante resta disponibile: il gate reale è il backend. Quando
  // l'enforcement è attivo, un non-admin lo vede disabilitato con motivo.
  const canAttempt = !auth.enforcementEnabled || roleAtLeast(auth.user?.role, 'admin')

  const handleRestart = async () => {
    if (restarting) return
    setRestarting(true)
    setMessage(null)
    try {
      await runElevated(
        () => api.restartSystemServices(),
        'Confirm restarting the hardware services. RGB and thermal capture will briefly stop.',
      )
      setMessage('Hardware services restarted.')
    } catch (e) {
      // L'operatore ha semplicemente annullato il dialogo di conferma: non
      // è un errore da mostrare, solo un'azione non completata.
      const cancelled = e instanceof ApiError && e.status === 403 && isStepUpRequiredBody(e.body)
      if (!cancelled) {
        setMessage(authErrorMessage(e))
      }
    } finally {
      setRestarting(false)
    }
  }

  return (
    <article className="easy-surface" style={{ marginTop: 'var(--space-3)' }}>
      <div className="easy-panelhead">
        <h2>System services</h2>
        <span className="easy-panelnote">Admin only</span>
      </div>
      <div className="easy-capturebar">
        <div>
          <b>Restart hardware services</b>
          <small>{message ?? 'Stops and restarts camera and thermal acquisition. Live feeds briefly drop.'}</small>
        </div>
        <button
          type="button"
          className="easy-btn danger"
          onClick={handleRestart}
          disabled={restarting || !canAttempt}
          title={canAttempt ? undefined : 'Requires role Admin or higher'}
        >
          {restarting ? 'Restarting…' : 'Restart services'}
        </button>
      </div>
    </article>
  )
}

interface HistoryItem {
  timestamp: number
  cpu_percent: number
  ram_percent: number
  [key: string]: number | string
}

const HISTORY_MAX_SAMPLES = 60
const CAMERA_REFRESH_MS = 30000

function formatBytes(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function CameraCard({
  primaryName,
  secondaryName,
  state,
  meta,
  error,
  message,
  initial,
}: {
  primaryName: string
  secondaryName: string
  state: string
  meta: [string, string][]
  error: string | null
  message: string | null
  initial: string
}) {
  const tone = toneForHardwareState(state)
  const offline = ['ERROR', 'OFFLINE', 'NOT_PRESENT', 'NOT_DETECTED'].includes(state)
  return (
    <div className="easy-hw" style={offline ? { borderColor: tone.color } : undefined}>
      <div className="easy-hwtop">
        <span className="easy-hwicon" aria-hidden>
          {initial}
        </span>
        <div style={{ minWidth: 0 }}>
          <b style={offline ? { color: tone.color } : undefined}>{primaryName}</b>
          <small className="mono">{secondaryName}</small>
        </div>
        <StatusBadge tone={tone} text={state} />
      </div>
      <div className="easy-hwmeta">
        {meta.map(([label, value]) => (
          <span key={label}>
            {label}: <span className="mono" style={{ color: 'var(--text-primary)' }}>{value}</span>
          </span>
        ))}
      </div>
      {error && <p className="easy-error">{error}</p>}
      {message && !error && <p className="easy-empty" style={{ marginTop: 6 }}>{message}</p>}
    </div>
  )
}

export function SystemDiagnosticsPage() {
  const systemData = useSystemStatus(10000)
  const { data: dashboardState } = useSharedDashboardState()

  const [cameras, setCameras] = useState<CameraInventory | null>(null)
  const [camerasError, setCamerasError] = useState<unknown>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])

  const loadCameras = useCallback(async () => {
    try {
      setCameras(await api.getCameras())
      setCamerasError(null)
    } catch (e) {
      setCamerasError(e)
    }
  }, [])

  useEffect(() => {
    loadCameras()
    const id = setInterval(loadCameras, CAMERA_REFRESH_MS)
    return () => clearInterval(id)
  }, [loadCameras])

  // Ring buffer della cronologia in state (non in un ref) così un nuovo
  // campione ridisegna subito: con un ref lo sparkline restava un campione
  // indietro rispetto ai numeri mostrati accanto.
  useEffect(() => {
    if (!systemData.data) return
    setHistory((prev) =>
      [
        ...prev,
        {
          timestamp: Date.now(),
          cpu_percent: systemData.data!.cpu_percent,
          ram_percent: systemData.data!.ram.percent,
        },
      ].slice(-HISTORY_MAX_SAMPLES),
    )
  }, [systemData.data])

  const handleRefreshInventory = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await api.refreshDevices()
      await loadCameras()
    } catch (e) {
      setCamerasError(e)
    } finally {
      setRefreshing(false)
    }
  }

  if (systemData.loading && !systemData.data) {
    return (
      <p className="easy-empty" role="status">
        Loading system diagnostics…
      </p>
    )
  }
  if (systemData.error && !systemData.data) {
    return (
      <div className="easy-panel">
        <h2 style={{ margin: 0, fontSize: 16 }}>Diagnostics unavailable</h2>
        <p className="easy-sub">The backend could not be reached: {String(systemData.error)}</p>
      </div>
    )
  }

  const diag = systemData.data!
  const historyData = history as SparklineData[]
  const diskPercent = diag.disk.percent
  const diskTone =
    diskPercent >= 90 ? 'var(--accent-critical)' : diskPercent >= 75 ? 'var(--accent-warn)' : 'var(--accent-ok)'
  const cpuTone =
    diag.cpu_percent >= 90 ? 'var(--accent-critical)' : diag.cpu_percent >= 70 ? 'var(--accent-warn)' : 'var(--accent-ok)'

  const components = dashboardState?.health?.system_components?.components ?? []
  const activeComponents = components.filter((c) => c.active).length

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Device health</div>
          <h1>System Diagnostics</h1>
          <p>Monitor Raspberry Pi resources, storage and camera hardware.</p>
        </div>
        <div className="easy-updated">
          {systemData.error ? (
            <>Connection lost — showing the <b>last received</b> sample</>
          ) : (
            <>Resource sampling every <b>10s</b></>
          )}
        </div>
      </section>

      <section className="easy-surface easy-identity" aria-live="polite">
        <div className="easy-id">
          <span>Hostname</span>
          <b className="mono">{diag.hostname}</b>
        </div>
        <div className="easy-id">
          <span>IP address</span>
          <b className="mono" style={{ color: 'var(--accent-info)' }}>
            {diag.ip_address}
          </b>
        </div>
        <div className="easy-id">
          <span>Device</span>
          <b>{diag.model}</b>
        </div>
        <div className="easy-id">
          <span>Operating system</span>
          <b>{diag.os_release}</b>
        </div>
        <div className="easy-id">
          <span>Uptime</span>
          <b className="mono">{formatUptime(diag.uptime_seconds)}</b>
        </div>
      </section>

      <section className="easy-resourcegrid">
        <article className="easy-surface easy-resource">
          <h2 className="easy-resourcetitle">CPU utilization</h2>
          <div className="easy-big" style={{ color: cpuTone }}>
            {diag.cpu_percent.toFixed(0)}%
          </div>
          <p>
            {diag.cpu_temperature_c !== null ? (
              <>
                Temperature{' '}
                <span className="mono" style={{ color: 'var(--text-primary)' }}>
                  {diag.cpu_temperature_c.toFixed(1)}°C
                </span>
              </>
            ) : (
              'Temperature not reported'
            )}
          </p>
          {historyData.length > 1 ? (
            <Sparkline
              data={historyData}
              dataKey="cpu_percent"
              label="%"
              color="var(--accent-info)"
              yMax={100}
              height={70}
              showGrid={false}
            />
          ) : (
            <p className="easy-empty">Collecting samples…</p>
          )}
        </article>

        <article className="easy-surface easy-resource">
          <h2 className="easy-resourcetitle">Memory</h2>
          {/* diag.ram.percent tiene conto di cache/buffer e può differire
              molto dal rapporto used/total: gauge e cronologia usano lo
              stesso campo per non mostrare due verità diverse. */}
          <div style={{ width: 120, margin: '12px auto 0' }}>
            <CpuRamGauge value={diag.ram.percent} max={100} label="Memory" color="var(--accent-warn)" height={110} />
          </div>
          <p style={{ textAlign: 'center' }}>
            <span className="mono" style={{ color: 'var(--text-primary)' }}>
              {formatBytes(diag.ram.used_mb)}
            </span>{' '}
            used of{' '}
            <span className="mono" style={{ color: 'var(--text-primary)' }}>
              {formatBytes(diag.ram.total_mb)}
            </span>
          </p>
        </article>

        <article className="easy-surface easy-resource">
          <h2 className="easy-resourcetitle">Disk storage</h2>
          <div className="easy-big" style={{ color: diskTone }}>
            {diskPercent.toFixed(0)}%
          </div>
          <p>
            <span className="mono" style={{ color: 'var(--text-primary)' }}>
              {diag.disk.used_gb.toFixed(1)} GB
            </span>{' '}
            used ·{' '}
            <span className="mono" style={{ color: 'var(--text-primary)' }}>
              {diag.disk.free_gb.toFixed(1)} GB
            </span>{' '}
            free
          </p>
          <div className="easy-bar" style={{ marginTop: 18 }}>
            <i style={{ width: `${Math.min(100, diskPercent)}%`, background: diskTone }} />
          </div>
          <div className="easy-thresholds">
            <span>0%</span>
            <span>75% warn</span>
            <span>90% critical</span>
          </div>
          <p style={{ color: diskTone }}>
            {diskPercent >= 90
              ? 'Critical: free space before collecting'
              : diskPercent >= 75
                ? 'Running low for long collections'
                : 'Healthy capacity for collection'}
          </p>
        </article>
      </section>

      <section className="easy-surface">
        <div className="easy-panelhead">
          <h2>Camera inventory</h2>
          <span className="easy-panelnote">Physical hardware and logical providers</span>
          <div className="easy-tools">
            <button type="button" className="easy-btn mini" onClick={handleRefreshInventory} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh inventory'}
            </button>
          </div>
        </div>

        {camerasError && !cameras ? (
          <p className="easy-error" style={{ margin: 13 }}>
            Camera inventory unavailable: {camerasError instanceof Error ? camerasError.message : String(camerasError)}
          </p>
        ) : !cameras ? (
          <p className="easy-empty" style={{ margin: 13 }}>
            Reading camera inventory…
          </p>
        ) : (
          <div className="easy-hwgrid">
            {cameras.rgb_cameras.map((cam) => (
              <CameraCard
                key={cam.logical_name}
                initial={/left/i.test(cam.logical_name) ? 'L' : /right/i.test(cam.logical_name) ? 'R' : 'C'}
                primaryName={cam.hardware_name}
                secondaryName={cam.logical_name}
                state={cam.state}
                meta={[
                  ['FPS', cam.fps?.toFixed(1) ?? '—'],
                  ['Enabled', cam.enabled ? 'Yes' : 'No'],
                ]}
                error={cam.error}
                message={cam.message}
              />
            ))}
            {cameras.thermal_camera &&
              (() => {
                const thermal = cameras.thermal_camera as Record<string, any>
                const status = thermal?.status ?? {}
                const runtimeState = thermal?.runtime_state ?? {}
                return (
                  <CameraCard
                    initial="TH"
                    primaryName={String(thermal?.hardware_name ?? 'Thermal sensor')}
                    secondaryName={String(thermal?.logical_name ?? 'THERMAL')}
                    state={String(thermal?.state ?? 'NOT_PRESENT')}
                    meta={[
                      ['Device', String(status.device ?? '—')],
                      ['Capture', runtimeState.capture_mode === 'on_demand' ? 'On demand' : String(runtimeState.capture_mode ?? '—')],
                    ]}
                    error={String(status.error || '') || null}
                    message={runtimeState.health && runtimeState.health !== 'GOOD' ? `Health: ${runtimeState.health}` : null}
                  />
                )
              })()}
          </div>
        )}

        <div style={{ margin: '0 10px', padding: '11px 0', borderTop: '1px solid var(--border-subtle)' }}>
          <Collapsible
            title={`System components — ${activeComponents} of ${components.length} active`}
            defaultOpen={false}
          >
            {components.length === 0 ? (
              <p className="easy-empty">No system component data available.</p>
            ) : (
              <div className="easy-tablewrap" tabIndex={0} role="region" aria-label="Scrollable table">
                <table className="easy-table">
                  <thead>
                    <tr>
                      {['Component', 'Kind', 'Status', 'Health', 'Uptime', 'Error'].map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((c) => {
                      const tone = toneForHardwareState(c.status)
                      const anomalous = ['ERROR', 'OFFLINE', 'DEGRADED'].includes(c.status)
                      return (
                        <tr key={c.id} style={anomalous ? { background: tone.dim } : undefined}>
                          <td className="easy-cell-strong" style={anomalous ? { color: tone.color } : undefined}>
                            {c.label}
                            {c.critical && (
                              // "CORE" e non "CRITICAL": classifica il
                              // componente come essenziale, non segnala un
                              // problema in corso.
                              <span className="mono" style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-muted)' }}>
                                CORE
                              </span>
                            )}
                          </td>
                          <td className="mono">{c.kind}</td>
                          <td>
                            <StatusBadge tone={tone} text={c.status} />
                          </td>
                          <td>{c.health}</td>
                          <td className="mono">{c.uptime}</td>
                          <td style={{ color: c.error ? 'var(--accent-critical)' : 'var(--text-muted)' }}>
                            {c.error || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Collapsible>
        </div>
      </section>

      <RestartServicesPanel />
    </>
  )
}
