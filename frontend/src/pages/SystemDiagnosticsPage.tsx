import { useEffect, useState } from 'react'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { StatusCard } from '../components/status/StatusCard'
import { StatusBadge } from '../components/status/StatusBadge'
import { toneForHardwareState } from '../components/status/severityColors'
import { Sparkline, type SparklineData } from '../components/charts/Sparkline'
import { CpuRamGauge } from '../components/charts/CpuRamGauge'
import type { CameraInventory } from '../api/types'

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 18 }}>System Diagnostics</h1>

      {/* System Info */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
          System Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          <StatusCard title="Hostname" value={diag.hostname} />
          <StatusCard title="IP Address" value={diag.ip_address} />
          <StatusCard title="Model" value={diag.model} />
          <StatusCard title="OS Release" value={diag.os_release} />
          <StatusCard title="Python Version" value={diag.python_version} />
          <StatusCard title="Uptime" value={formatUptime(diag.uptime_seconds)} hint={diag.uptime_human} />
        </div>
      </section>

      {/* CPU & RAM Gauges */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
          Resource Usage
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <CpuRamGauge value={diag.cpu_percent} label="CPU" color="var(--accent-info)" />
            {diag.cpu_temperature_c !== null && (
              <div style={{ marginTop: 'var(--space-3)', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                Temp: <span style={{ color: 'var(--text-primary)' }} className="mono">{diag.cpu_temperature_c.toFixed(1)}°C</span>
              </div>
            )}
          </div>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            {/* diag.ram.percent (accounting for cache/buffers) can differ
                substantially from a naive used_mb/total_mb ratio — using
                used/total here showed 41% while the sparkline below (which
                already used ram.percent) showed 87% for the same instant. */}
            <CpuRamGauge value={diag.ram.percent} max={100} label="Memory" color="var(--accent-warn)" />
          </div>
        </div>
      </section>

      {/* RAM Details */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
          Memory Details
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          <StatusCard title="Total" value={formatBytes(diag.ram.total_mb)} />
          <StatusCard title="Used" value={formatBytes(diag.ram.used_mb)} />
          <StatusCard title="Available" value={formatBytes(diag.ram.available_mb)} />
        </div>
      </section>

      {/* Disk */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
          Disk Storage
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          <StatusCard title="Total" value={`${diag.disk.total_gb.toFixed(1)} GB`} />
          <StatusCard title="Used" value={`${diag.disk.used_gb.toFixed(1)} GB`} hint={`${diag.disk.percent.toFixed(0)}% full`} />
          <StatusCard title="Free" value={`${diag.disk.free_gb.toFixed(1)} GB`} />
        </div>
      </section>

      {/* CPU History */}
      {historyData.length > 1 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
            CPU Usage History (10 minutes)
          </h2>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <Sparkline data={historyData} dataKey="cpu_percent" label="%" color="var(--accent-info)" yMax={100} height={250} />
          </div>
        </section>
      )}

      {/* RAM History */}
      {historyData.length > 1 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
            Memory Usage History (10 minutes)
          </h2>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <Sparkline data={historyData} dataKey="ram_percent" label="%" color="var(--accent-warn)" yMax={100} height={250} />
          </div>
        </section>
      )}

      {/* Camera Inventory */}
      {cameras && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
            Camera Inventory
          </h2>

          {/* RGB Cameras */}
          <div>
            <h3 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>RGB Cameras</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {cameras.rgb_cameras.map((cam) => (
                <div key={cam.logical_name} style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 'var(--space-2)' }}>
                    <div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {cam.logical_name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                        {cam.hardware_name}
                      </div>
                    </div>
                    <StatusBadge tone={toneForHardwareState(cam.state)} text={cam.state} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 12, color: 'var(--text-muted)' }}>
                    <div>FPS: <span style={{ color: 'var(--text-primary)' }} className="mono">{cam.fps?.toFixed(1) ?? '—'}</span></div>
                    <div>Enabled: <span style={{ color: 'var(--text-primary)' }} className="mono">{cam.enabled ? 'Yes' : 'No'}</span></div>
                  </div>
                  {cam.error && (
                    <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--accent-critical-dim)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--accent-critical)' }}>
                      Error: {cam.error}
                    </div>
                  )}
                  {cam.message && !cam.error && (
                    <div style={{ marginTop: 'var(--space-2)', fontSize: 11, color: 'var(--text-muted)' }}>
                      {cam.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Thermal Camera */}
          {cameras.thermal_camera && (
            <div>
              <h3 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>Thermal Camera</h3>
              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {(cameras.thermal_camera as any)?.logical_name ?? 'Thermal Sensor'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                      {(cameras.thermal_camera as any)?.hardware_name ?? 'Unknown'}
                    </div>
                  </div>
                  <StatusBadge
                    tone={toneForHardwareState((cameras.thermal_camera as any)?.state ?? 'NOT_PRESENT')}
                    text={(cameras.thermal_camera as any)?.state ?? 'NOT_PRESENT'}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Health & System Components */}
      {dashboardState && dashboardState.health && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
            System Components Status
          </h2>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
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
                    {dashboardState.health.system_components.components.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)' }}>
                          {c.label}
                          {c.critical && (
                            <span className="mono" style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-muted)' }}>
                              CRITICAL
                            </span>
                          )}
                        </td>
                        <td className="mono" style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                          {c.kind}
                        </td>
                        <td style={{ padding: 'var(--space-2)' }}>
                          <StatusBadge tone={toneForHardwareState(c.status)} text={c.status} />
                        </td>
                        <td style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>{c.health}</td>
                        <td className="mono" style={{ padding: 'var(--space-2)', color: 'var(--text-muted)' }}>
                          {c.uptime}
                        </td>
                        <td style={{ padding: 'var(--space-2)', color: c.error ? 'var(--accent-critical)' : 'var(--text-muted)', maxWidth: 260 }}>
                          {c.error || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No system components data available</p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
