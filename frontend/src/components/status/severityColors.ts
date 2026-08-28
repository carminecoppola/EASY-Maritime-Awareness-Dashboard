import type { Availability, DetectionStatus, EventSeverity, EventStatus } from '../../api/types'

export type ToneKey = 'ok' | 'info' | 'warn' | 'critical' | 'neutral'

export interface Tone {
  color: string
  dim: string
  label: string
}

const TONES: Record<ToneKey, Tone> = {
  ok: { color: 'var(--accent-ok)', dim: 'var(--accent-ok-dim)', label: 'OK' },
  info: { color: 'var(--accent-info)', dim: 'var(--accent-info-dim)', label: 'INFO' },
  warn: { color: 'var(--accent-warn)', dim: 'var(--accent-warn-dim)', label: 'WARN' },
  critical: { color: 'var(--accent-critical)', dim: 'var(--accent-critical-dim)', label: 'CRITICAL' },
  neutral: { color: 'var(--text-muted)', dim: 'var(--bg-3)', label: '—' },
}

export function toneForSeverity(severity: EventSeverity | string): Tone {
  switch (severity) {
    case 'INFO':
      return { ...TONES.info, label: 'INFO' }
    case 'LOW':
      return { ...TONES.ok, label: 'LOW' }
    case 'MEDIUM':
      return { ...TONES.warn, label: 'MEDIUM' }
    case 'HIGH':
      return { color: 'var(--severity-high)', dim: 'var(--accent-warn-dim)', label: 'HIGH' }
    case 'CRITICAL':
      return { ...TONES.critical, label: 'CRITICAL' }
    default:
      return { ...TONES.neutral, label: String(severity) }
  }
}

export function toneForEventStatus(status: EventStatus | DetectionStatus | string): Tone {
  switch (status) {
    case 'NEW':
      return { ...TONES.info, label: 'NEW' }
    case 'ACTIVE':
      return { ...TONES.warn, label: 'ACTIVE' }
    case 'RESOLVED':
      return { ...TONES.ok, label: 'RESOLVED' }
    default:
      return { ...TONES.neutral, label: String(status) }
  }
}

export function toneForAvailability(availability: Availability | string): Tone {
  switch (availability) {
    case 'STREAMING':
      return { ...TONES.ok, label: 'STREAMING' }
    case 'READY':
      return { ...TONES.info, label: 'READY' }
    case 'INITIALIZING':
      return { ...TONES.warn, label: 'INITIALIZING' }
    case 'NOT_PRESENT':
      return { ...TONES.neutral, label: 'NOT PRESENT' }
    case 'ERROR':
      return { ...TONES.critical, label: 'ERROR' }
    default:
      return { ...TONES.neutral, label: String(availability) }
  }
}

/** RUNNING/STOPPED per sessioni — usa questa ovunque invece di ricostruire il tono a mano. */
export function toneForRunningStatus(status: 'RUNNING' | 'STOPPED' | string): Tone {
  switch (status) {
    case 'RUNNING':
      return { ...TONES.ok, label: 'RUNNING' }
    case 'STOPPED':
      return { ...TONES.neutral, label: 'STOPPED' }
    default:
      return { ...TONES.neutral, label: String(status) }
  }
}

/**
 * Stato hardware/componente generico (camere, manager di sistema): STREAMING
 * e READY sono "buoni" (verde/blu), ERROR è sempre critico (rosso) — non un
 * semplice warning, per non sottostimare visivamente un guasto reale.
 */
export function toneForHardwareState(state: string): Tone {
  switch (state) {
    case 'STREAMING':
    case 'GOOD':
    case 'READY':
    // Per RgbMasterSource.camera_state() (easy_dashboard/rgb_hardware.py),
    // DETECTED è l'unico stato raggiungibile da una camera RGB sana e in
    // streaming — non un "quasi pronto" — quindi va con gli stati OK, non
    // con i warning, altrimenti una camera perfettamente funzionante appare
    // sempre in avviso.
    case 'DETECTED':
    case 'ONLINE':
      return { ...TONES.ok, label: state }
    case 'INITIALIZING':
    case 'DEGRADED':
      return { ...TONES.warn, label: state }
    case 'ERROR':
    case 'OFFLINE':
    case 'NOT_DETECTED':
      return { ...TONES.critical, label: state }
    case 'NOT_PRESENT':
    case 'UNKNOWN':
      return { ...TONES.neutral, label: state }
    default:
      return { ...TONES.neutral, label: state }
  }
}
