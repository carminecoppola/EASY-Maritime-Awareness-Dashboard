/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Mapping from domain states (severity, availability, hardware state...) to colour tones.
 *
 * Every status in the UI gets its colour here, so the same state looks the same
 * on every page.
 */

import type { Availability, DetectionStatus, EventSeverity, EventStatus } from '../../api/types'

/** Names of the base tones. */
export type ToneKey = 'ok' | 'info' | 'warn' | 'critical' | 'neutral'

/** Foreground colour, dim background colour and label of a status. */
export interface Tone {
  color: string
  dim: string
  label: string
}

// Exported for cases (top bar, etc.) that need a "pure" tone without a dedicated
// switch/case, so Tone objects are not reinvented inline for each state.
/** The base tones. */
export const TONES: Record<ToneKey, Tone> = {
  ok: { color: 'var(--accent-ok)', dim: 'var(--accent-ok-dim)', label: 'OK' },
  info: { color: 'var(--accent-info)', dim: 'var(--accent-info-dim)', label: 'INFO' },
  warn: { color: 'var(--accent-warn)', dim: 'var(--accent-warn-dim)', label: 'WARN' },
  critical: { color: 'var(--accent-critical)', dim: 'var(--accent-critical-dim)', label: 'CRITICAL' },
  neutral: { color: 'var(--text-muted)', dim: 'var(--bg-3)', label: '—' },
}

/** Tone of an event severity (INFO to CRITICAL). */
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

/** Tone of an event or detection status (NEW, ACTIVE, RESOLVED). */
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

/** Tone of a sensor availability value. */
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

/** RUNNING/STOPPED for sessions. Use it everywhere instead of rebuilding the tone by hand. */
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

/** Tone for an "N of M" ratio (online devices, etc.): all ok = ok, zero = critical, otherwise warn. */
export function toneForRatio(online: number, total: number): Tone {
  if (total === 0) return TONES.neutral
  if (online === 0) return TONES.critical
  if (online === total) return TONES.ok
  return TONES.warn
}

/**
 * Generic hardware or component state (cameras, system managers): STREAMING and
 * READY are "good" (green/blue) and ERROR is always critical (red), never a mere
 * warning, so a real failure is not visually underestimated.
 */
export function toneForHardwareState(state: string): Tone {
  switch (state) {
    case 'STREAMING':
    case 'GOOD':
    case 'READY':
    // For RgbMasterSource.camera_state() (easy_dashboard/rgb_hardware.py),
    // DETECTED is the only state reachable by a healthy, streaming RGB camera
    // (not an "almost ready"), so it goes with the OK states, not with the
    // warnings; otherwise a perfectly working camera would always look degraded.
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
