import type { DashboardState, RgbCamera } from '../api/types'
import { sensorReadiness } from './readiness'

export type CheckLevel = 'ok' | 'warn' | 'fail' | 'unknown'

export interface PreflightCheck {
  id: string
  label: string
  detail: string
  state: string
  level: CheckLevel
}

export const CHECK_COLOR: Record<CheckLevel, string> = {
  ok: 'var(--accent-ok)',
  warn: 'var(--accent-warn)',
  fail: 'var(--accent-critical)',
  unknown: 'var(--text-muted)',
}

export const CHECK_GLYPH: Record<CheckLevel, string> = {
  ok: '✓',
  warn: '!',
  fail: '×',
  unknown: '?',
}

/** Soglie CPU del Raspberry: oltre 80 °C il SoC inizia a limitare la frequenza. */
const TEMP_WARN_C = 75
const TEMP_HIGH_C = 80

/** Sotto questa soglia una missione rischia di riempire il disco durante l'acquisizione. */
const DISK_LOW_GB = 5

const UNKNOWN_CHECKS: PreflightCheck[] = [
  { id: 'rgb', label: 'RGB feeds current', detail: 'Waiting for the first status payload', state: 'UNKNOWN', level: 'unknown' },
  { id: 'thermal', label: 'Thermal available', detail: 'Waiting for the first status payload', state: 'UNKNOWN', level: 'unknown' },
  { id: 'storage', label: 'Storage capacity', detail: 'Waiting for the first status payload', state: 'UNKNOWN', level: 'unknown' },
  { id: 'temperature', label: 'System temperature', detail: 'Waiting for the first status payload', state: 'UNKNOWN', level: 'unknown' },
]

export function preflightChecks(data: DashboardState | null): PreflightCheck[] {
  // Nessun payload ancora ricevuto non è un guasto: dichiararlo "fallito"
  // farebbe sembrare l'hardware rotto durante il normale caricamento.
  if (!data || !data.health) return UNKNOWN_CHECKS

  const sensors = sensorReadiness(data)
  const [left, right, thermal] = sensors
  const system = data?.health?.system
  const thermalPayload = (data?.health?.thermal ?? {}) as { device?: string }
  const cameras = ((data?.health?.cameras as { rgb_cameras?: RgbCamera[] } | undefined)?.rgb_cameras ?? []) as RgbCamera[]

  const fpsFor = (side: 'left' | 'right') => {
    const camera = cameras.find((c) => String(c.logical_name || '').toLowerCase().includes(side))
    return typeof camera?.fps === 'number' ? `${camera.fps.toFixed(1)} FPS` : 'FPS unavailable'
  }

  const rgbOnline = [left, right].filter((s) => s.ready).length
  const rgbCheck: PreflightCheck = {
    id: 'rgb',
    label: 'RGB feeds current',
    detail: `Left ${fpsFor('left')} · Right ${fpsFor('right')}`,
    state: rgbOnline === 2 ? 'READY' : rgbOnline === 1 ? 'PARTIAL' : 'UNAVAILABLE',
    level: rgbOnline === 2 ? 'ok' : rgbOnline === 1 ? 'warn' : 'fail',
  }

  const thermalCheck: PreflightCheck = {
    id: 'thermal',
    label: 'Thermal available',
    detail: thermalPayload.device ? `Device ${thermalPayload.device}` : 'Device path unavailable',
    state: thermal.ready ? 'READY' : thermal.availability,
    level: thermal.ready ? 'ok' : thermal.availability === 'ERROR' ? 'fail' : 'warn',
  }

  const disk = system?.disk
  const storageCheck: PreflightCheck = disk
    ? {
        id: 'storage',
        label: 'Storage capacity',
        detail: `${disk.free_gb.toFixed(1)} GB available · ${(100 - disk.percent).toFixed(0)}% free`,
        state: disk.free_gb < DISK_LOW_GB ? 'LOW' : 'OK',
        level: disk.free_gb < DISK_LOW_GB ? 'fail' : 'ok',
      }
    : {
        id: 'storage',
        label: 'Storage capacity',
        detail: 'Disk usage not reported',
        state: 'UNKNOWN',
        level: 'unknown',
      }

  const temp = system?.cpu_temperature_c
  const tempCheck: PreflightCheck =
    typeof temp === 'number'
      ? {
          id: 'temperature',
          label: 'System temperature',
          // Il backend non espone lo stato di throttling: si riporta la
          // temperatura misurata, senza dichiarare "no throttling".
          detail: `${temp.toFixed(1)}°C · throttling state not reported`,
          state: temp >= TEMP_HIGH_C ? 'HIGH' : temp >= TEMP_WARN_C ? 'WARM' : 'NORMAL',
          level: temp >= TEMP_HIGH_C ? 'fail' : temp >= TEMP_WARN_C ? 'warn' : 'ok',
        }
      : {
          id: 'temperature',
          label: 'System temperature',
          detail: 'CPU temperature not reported',
          state: 'UNKNOWN',
          level: 'unknown',
        }

  return [rgbCheck, thermalCheck, storageCheck, tempCheck]
}

export interface PreflightSummary {
  level: CheckLevel
  label: string
  detail: string
}

export function preflightSummary(checks: PreflightCheck[]): PreflightSummary {
  const failed = checks.filter((c) => c.level === 'fail')
  const warned = checks.filter((c) => c.level === 'warn')
  const unknown = checks.filter((c) => c.level === 'unknown')

  if (failed.length > 0) {
    return { level: 'fail', label: 'Not ready', detail: `${failed.length} blocking check${failed.length === 1 ? '' : 's'}` }
  }
  if (warned.length > 0) {
    return { level: 'warn', label: 'Start with caution', detail: `${warned.length} check${warned.length === 1 ? '' : 's'} degraded` }
  }
  if (unknown.length > 0) {
    return { level: 'unknown', label: 'Checks incomplete', detail: `${unknown.length} value${unknown.length === 1 ? '' : 's'} unavailable` }
  }
  return { level: 'ok', label: 'Ready to start', detail: 'All required checks passed' }
}
