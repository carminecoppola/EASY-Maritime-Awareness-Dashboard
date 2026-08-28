import { useEffect, useRef } from 'react'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { StatusCard } from '../components/status/StatusCard'
import { StatusBadge } from '../components/status/StatusBadge'
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

  // Ring buffer for history
  const historyRef = useRef<HistoryItem[]>([])

  // Update history when system data changes
  useEffect(() => {
    if (systemData.data) {
      const newItem: HistoryItem = {
        timestamp: Date.now(),
        cpu_percent: systemData.data.cpu_percent,
        ram_percent: systemData.data.ram.percent,
      }

      historyRef.current.push(newItem)
      if (historyRef.current.length > HISTORY_MAX_SAMPLES) {
        historyRef.current.shift()
      }
    }
  }, [systemData.data])

  if (systemData.loading && !systemData.data) {
    return <p style={{ color: 'var(--text-muted)' }}>Caricamento diagnostica di sistema…</p>
  }
  if (systemData.error && !systemData.data) {
    return <p style={{ color: 'var(--accent-critical)' }}>Errore nel recupero diagnostica: {String(systemData.error)}</p>
  }

  const diag = systemData.data!
  const history = historyRef.current as SparklineData[]
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
            <CpuRamGauge value={diag.ram.used_mb} max={diag.ram.total_mb} label="Memory" color="var(--accent-warn)" />
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
      {history.length > 1 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
            CPU Usage History (10 minutes)
          </h2>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <Sparkline data={history} dataKey="cpu_percent" label="%" color="var(--accent-info)" yMax={100} height={250} />
          </div>
        </section>
      )}

      {/* RAM History */}
      {history.length > 1 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
            Memory Usage History (10 minutes)
          </h2>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <Sparkline data={history} dataKey="ram_percent" label="%" color="var(--accent-warn)" yMax={100} height={250} />
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
                    <StatusBadge tone={{ color: cam.state === 'STREAMING' ? 'var(--accent-ok)' : 'var(--accent-warn)', dim: cam.state === 'STREAMING' ? 'var(--accent-ok-dim)' : 'var(--accent-warn-dim)', label: cam.state }} text={cam.state} />
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
                  <StatusBadge tone={{ color: (cameras.thermal_camera as any)?.state === 'STREAMING' ? 'var(--accent-ok)' : 'var(--accent-warn)', dim: (cameras.thermal_camera as any)?.state === 'STREAMING' ? 'var(--accent-ok-dim)' : 'var(--accent-warn-dim)', label: (cameras.thermal_camera as any)?.state ?? 'NOT_PRESENT' }} text={(cameras.thermal_camera as any)?.state ?? 'NOT_PRESENT'} />
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
            {dashboardState.health.system_components && typeof dashboardState.health.system_components === 'object' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                {Object.entries(dashboardState.health.system_components as Record<string, unknown>).map(([key, value]) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 'var(--space-1)' }}>
                      {key.replace(/_/g, ' ')}
                    </div>
                    <div className="mono" style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {JSON.stringify(value, null, 0)}
                    </div>
                  </div>
                ))}
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
