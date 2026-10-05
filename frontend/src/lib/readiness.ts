/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Sensor readiness derived from the dashboard state, and the overall readiness level.
 */

import type { Availability, DashboardState } from '../api/types'

/** Availability of one sensor and whether it counts as ready. */
export interface SensorReadiness {
  key: 'rgb_left' | 'rgb_right' | 'thermal'
  label: string
  availability: Availability
  /** READY covers start-up; STREAMING confirms continuous, recent frames. */
  ready: boolean
}

/** Validate an availability value, treating anything unknown as NOT_PRESENT. */
function availabilityOf(value: unknown): Availability {
  const known: Availability[] = ['STREAMING', 'READY', 'INITIALIZING', 'NOT_PRESENT', 'ERROR']
  return known.includes(value as Availability) ? (value as Availability) : 'NOT_PRESENT'
}

/** Readiness of RGB left, RGB right and thermal. RGB needs STREAMING; thermal accepts READY or STREAMING. */
export function sensorReadiness(data: DashboardState | null): SensorReadiness[] {
  const rgb = data?.health?.runtime_state?.rgb
  const thermal = data?.health?.runtime_state?.thermal
  const devices = (data?.devices?.devices ?? []) as Record<string, any>[]

  // The feed lives in `configuration.feed`, not at the top level: looking for it
  // there always failed and BOTH cameras fell back to the aggregated RGB state,
  // so a broken right camera showed as STREAMING.
  const deviceFor = (feed: string) =>
    devices.find((d) => d.device_id === feed || d.configuration?.feed === feed)?.runtime_state?.availability

  const left = availabilityOf(deviceFor('rgb_left') ?? rgb?.availability)
  const right = availabilityOf(deviceFor('rgb_right') ?? rgb?.availability)
  const th = availabilityOf(thermal?.availability)

  return [
    { key: 'rgb_left', label: 'RGB Left', availability: left, ready: left === 'STREAMING' },
    { key: 'rgb_right', label: 'RGB Right', availability: right, ready: right === 'STREAMING' },
    { key: 'thermal', label: 'Thermal', availability: th, ready: th === 'READY' || th === 'STREAMING' },
  ]
}

/** Overall level: all sensors ready, some, or none. */
export type ReadinessLevel = 'ready' | 'degraded' | 'unavailable'

/** Reduce the sensor list to ready, degraded or unavailable. */
export function readinessLevel(sensors: SensorReadiness[]): ReadinessLevel {
  const readyCount = sensors.filter((s) => s.ready).length
  if (readyCount === sensors.length) return 'ready'
  if (readyCount === 0) return 'unavailable'
  return 'degraded'
}

/** Operator-facing label of each level. */
export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  ready: 'Ready to operate',
  degraded: 'Partially available',
  unavailable: 'Not operational',
}

/** Colour token of each level. */
export const READINESS_COLOR: Record<ReadinessLevel, string> = {
  ready: 'var(--accent-ok)',
  degraded: 'var(--accent-warn)',
  unavailable: 'var(--accent-critical)',
}
