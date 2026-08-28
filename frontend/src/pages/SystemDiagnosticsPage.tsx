import { useEffect, useState } from 'react'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { StatusBadge } from '../components/status/StatusBadge'
import { toneForHardwareState } from '../components/status/severityColors'
import { Sparkline, type SparklineData } from '../components/charts/Sparkline'
import { CpuRamGauge } from '../components/charts/CpuRamGauge'
import { Collapsible } from '../components/common/Collapsible'
import type { CameraInventory } from '../api/types'

const SECTION_TITLE_STYLE = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  marginBottom: 'var(--space-1)',
}

const PANEL_STYLE = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
}

function IdentityField({
  label,
  value,
  emphasis = false,
  first = false,
  wide = false,
}: {
  label: string
  value: string
  emphasis?: boolean
  first?: boolean
  /** Model/OS strings are long enough that a single-line ellipsis silently
   * hides real information (only recoverable via hover, which doesn't work
   * on touch) — those wrap to two lines instead of truncating. */
  wide?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
        padding: '0 var(--space-4)',
        borderLeft: first ? 'none' : '1px solid var(--border-subtle)',
        gridColumn: wide ? 'span 2' : undefined,
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: emphasis ? 15 : 13,
          fontWeight: emphasis ? 600 : 400,
          color: emphasis ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: wide ? 'clip' : 'ellipsis',
          whiteSpace: wide ? 'normal' : 'nowrap',
          lineHeight: 1.4,
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function CameraCard({
  primaryName,
  secondaryName,
  state,
  meta,
  error,
  message,
}: {
  primaryName: string
  secondaryName: string
  state: string
  meta: [string, string][]
  error: string | null
  message: string | null
}) {
  const tone = toneForHardwareState(state)
  const isOffline = ['ERROR', 'OFFLINE', 'NOT_PRESENT'].includes(state)
  return (
    <div
      style={{
        background: isOffline ? tone.dim : 'var(--bg-2)',
        border: isOffline ? `1px solid ${tone.color}` : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        transition: 'all 150ms ease-out',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 'var(--space-2)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isOffline ? tone.color : 'var(--text-primary)' }}>
            {primaryName}
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {secondaryName}
          </div>
        </div>
        <StatusBadge tone={tone} text={state} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 12, color: 'var(--text-muted)' }}>
        {meta.map(([label, value]) => (
          <div key={label}>
            {label}: <span style={{ color: 'var(--text-primary)' }} className="mono">{value}</span>
          </div>
        ))}
      </div>
      {error && (
        <div style={{ padding: 'var(--space-2)', background: 'var(--accent-critical-dim)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--accent-critical)' }}>
          Error: {error}
        </div>
      )}
      {message && !error && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{message}</div>
      )}
    </div>
  )
}

interface HistoryItem {
  timestamp: number
  cpu_percent: number
  ram_percent: number
  [key: string]: number | string
}

const HISTORY_MAX_SAMPLES = 60

function formatBytes(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`
  }
  return `${mb.toFixed(1)} MB`
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

export function SystemDiagnosticsPage() {
  const systemData = useSystemStatus(10000)
  const { data: dashboardState } = useSharedDashboardState()
  const camerasData = usePolling(() => api.getCameras(), { intervalMs: 30000 })

  // Ring buffer for history — kept in state (not a plain ref) so a new
  // sample triggers a re-render immediately; a ref-only buffer left the
  // sparkline permanently one sample behind the numbers shown elsewhere.
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    if (!systemData.data) return
    const newItem: HistoryItem = {
      timestamp: Date.now(),
      cpu_percent: systemData.data.cpu_percent,
      ram_percent: systemData.data.ram.percent,
    }
    setHistory((prev) => [...prev, newItem].slice(-HISTORY_MAX_SAMPLES))
  }, [systemData.data])

  if (systemData.loading && !systemData.data) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading system diagnostics…</p>
  }
  if (systemData.error && !systemData.data) {
    return <p style={{ color: 'var(--accent-critical)' }}>Failed to load diagnostics: {String(systemData.error)}</p>
  }

  const diag = systemData.data!
  const historyData = history as SparklineData[]
  const cameras = camerasData.data as CameraInventory | null

  const diskUsedPercent = diag.disk.percent
  const diskTone = diskUsedPercent >= 90 ? 'var(--accent-critical)' : diskUsedPercent >= 75 ? 'var(--accent-warn)' : 'var(--accent-ok)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 18 }}>System Diagnostics</h1>

      {/* PRIMARY: compact identity strip — one glance, not six equal-weight
          cards. Hostname/IP get more visual weight (what an operator
          actually needs to confirm they're on the right device / reach it
          over the network); OS/Python/uptime are secondary reference info. */}
      <section style={PANEL_STYLE}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-3)' }}>
          Device
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', rowGap: 'var(--space-3)' }}>
          <IdentityField label="Hostname" value={diag.hostname} emphasis first />
          <IdentityField label="IP Address" value={diag.ip_address} emphasis />
          <IdentityField label="Uptime" value={formatUptime(diag.uptime_seconds)} />
          <IdentityField label="Python" value={diag.python_version} />
          <IdentityField label="Model" value={diag.model} wide />
          <IdentityField label="OS" value={diag.os_release} wide />
        </div>
      </section>

      {/* PRIMARY: CPU and Memory each fully self-contained — gauge, key
          numbers, and trend live together instead of being scattered
          across three separate sections a scroll apart. */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={SECTION_TITLE_STYLE}>Resource Usage</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
          <div style={PANEL_STYLE}>
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
              <div style={{ flexShrink: 0, width: 120 }}>
                <CpuRamGauge value={diag.cpu_percent} label="CPU" color="var(--accent-info)" height={110} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {diag.cpu_temperature_c !== null && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                    Temp: <span style={{ color: 'var(--text-primary)' }} className="mono">{diag.cpu_temperature_c.toFixed(1)}°C</span>
                  </div>
                )}
                {historyData.length > 1 && (
                  <Sparkline data={historyData} dataKey="cpu_percent" label="%" color="var(--accent-info)" yMax={100} height={90} showGrid={false} />
                )}
              </div>
            </div>
          </div>
          <div style={PANEL_STYLE}>
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
              <div style={{ flexShrink: 0, width: 120 }}>
                {/* diag.ram.percent (accounting for cache/buffers) can differ
                    substantially from a naive used_mb/total_mb ratio — using
                    used/total here showed 41% while ram.percent showed 87%
                    for the same instant, so both gauge and history use
                    ram.percent consistently. */}
                <CpuRamGauge value={diag.ram.percent} max={100} label="Memory" color="var(--accent-warn)" height={110} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-primary)' }} className="mono">{formatBytes(diag.ram.used_mb)}</span> used of{' '}
                  <span style={{ color: 'var(--text-primary)' }} className="mono">{formatBytes(diag.ram.total_mb)}</span>
                </div>
                {historyData.length > 1 && (
                  <Sparkline data={historyData} dataKey="ram_percent" label="%" color="var(--accent-warn)" yMax={100} height={90} showGrid={false} />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRIMARY: Disk — one compact bar instead of three equal-weight cards */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={SECTION_TITLE_STYLE}>Disk Storage</h2>
        <div style={PANEL_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {/* Same visual language as the CPU/Memory gauges above — a big
                colored percentage — instead of a bare thin bar with no
                number, which read as an afterthought next to them. */}
            <div
              className="mono"
              style={{ fontSize: 28, fontWeight: 600, color: diskTone, flexShrink: 0, minWidth: 64, textAlign: 'right' }}
            >
              {diskUsedPercent.toFixed(0)}%
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)', fontSize: 13 }}>
                <span className="mono" style={{ color: 'var(--text-primary)' }}>
                  {diag.disk.used_gb.toFixed(1)} GB used of {diag.disk.total_gb.toFixed(1)} GB
                </span>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>{diag.disk.free_gb.toFixed(1)} GB free</span>
              </div>
              <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, diskUsedPercent)}%`,
                    background: diskTone,
                    borderRadius: 5,
                    transition: 'width 300ms ease-out',
                  }}
                />
                {/* Threshold markers so the color change (green→amber→red)
                    has a visible reference instead of just changing
                    unexplained. */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '75%', width: 1, background: 'var(--bg-0)', opacity: 0.6 }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '90%', width: 1, background: 'var(--bg-0)', opacity: 0.6 }} />
              </div>
              <div style={{ position: 'relative', height: 14, marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                <span style={{ position: 'absolute', left: 0 }}>0%</span>
                <span style={{ position: 'absolute', left: '75%', transform: 'translateX(-50%)' }}>75% warn</span>
                <span style={{ position: 'absolute', right: 0 }}>90% critical</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Camera Inventory — RGB and thermal in one consistent grid instead
          of two differently-laid-out sub-sections; hardware_name (the
          human-readable "Arducam UC-517 LEFT") leads, the internal
          logical_name ("RGB_CAM_LEFT") is now the small secondary tag
          instead of the other way around. */}
      {cameras && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={SECTION_TITLE_STYLE}>Camera Inventory</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
            {cameras.rgb_cameras.map((cam) => (
              <CameraCard
                key={cam.logical_name}
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
            {cameras.thermal_camera && (() => {
              const thermal = cameras.thermal_camera as any
              const status = thermal?.status ?? {}
              const runtimeState = thermal?.runtime_state ?? {}
              return (
                <CameraCard
                  primaryName={thermal?.hardware_name ?? 'Thermal Sensor'}
                  secondaryName={thermal?.logical_name ?? 'THERMAL_FLIR'}
                  state={thermal?.state ?? 'NOT_PRESENT'}
                  meta={[
                    ['Device', status.device ?? '—'],
                    ['Capture', runtimeState.capture_mode === 'on_demand' ? 'On demand' : (runtimeState.capture_mode ?? '—')],
                  ]}
                  error={null}
                  message={null}
                />
              )
            })()}
          </div>
        </section>
      )}

      {/* SECONDARY (collapsed by default): per-manager technical detail —
          useful when actually debugging, noise the rest of the time. */}
      {dashboardState && dashboardState.health && (
        <Collapsible title="System Components (technical detail)" defaultOpen={false}>
          <div style={PANEL_STYLE}>
            {dashboardState.health.system_components?.components?.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['Component', 'Kind', 'Status', 'Health', 'Uptime', 'Error'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: 'var(--space-2)',
                            textAlign: 'left',
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            fontSize: 10,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardState.health.system_components.components.map((c) => {
                      const tone = toneForHardwareState(c.status)
                      const isAnomalous = ['ERROR', 'OFFLINE', 'DEGRADED'].includes(c.status)
                      return (
                        <tr
                          key={c.id}
                          style={{
                            borderBottom: '1px solid var(--border-subtle)',
                            background: isAnomalous ? tone.dim : undefined,
                          }}
                        >
                          <td style={{ padding: 'var(--space-2)', color: isAnomalous ? tone.color : 'var(--text-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              {isAnomalous && (
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: tone.color,
                                    flexShrink: 0,
                                  }}
                                  aria-hidden
                                />
                              )}
                              <span>
                                {c.label}
                                {c.critical && (
                                  <span className="mono" style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-muted)' }}>
                                    CRITICAL
                                  </span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="mono" style={{ padding: 'var(--space-2)', color: isAnomalous ? tone.color : 'var(--text-secondary)' }}>
                            {c.kind}
                          </td>
                          <td style={{ padding: 'var(--space-2)' }}>
                            <StatusBadge tone={tone} text={c.status} />
                          </td>
                          <td style={{ padding: 'var(--space-2)', color: isAnomalous ? tone.color : 'var(--text-secondary)' }}>
                            {c.health}
                          </td>
                          <td className="mono" style={{ padding: 'var(--space-2)', color: isAnomalous ? tone.color : 'var(--text-muted)' }}>
                            {c.uptime}
                          </td>
                          <td style={{ padding: 'var(--space-2)', color: c.error ? 'var(--accent-critical)' : 'var(--text-muted)', maxWidth: 260 }}>
                            {c.error || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No system components data available</p>
            )}
          </div>
        </Collapsible>
      )}
    </div>
  )
}
