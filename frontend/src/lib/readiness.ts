import type { Availability, DashboardState } from '../api/types'

export interface SensorReadiness {
  key: 'rgb_left' | 'rgb_right' | 'thermal'
  label: string
  availability: Availability
  /** Il termico è on-demand: READY non significa streaming continuo. */
  ready: boolean
}

function availabilityOf(value: unknown): Availability {
  const known: Availability[] = ['STREAMING', 'READY', 'INITIALIZING', 'NOT_PRESENT', 'ERROR']
  return known.includes(value as Availability) ? (value as Availability) : 'NOT_PRESENT'
}

export function sensorReadiness(data: DashboardState | null): SensorReadiness[] {
  const rgb = data?.health?.runtime_state?.rgb
  const thermal = data?.health?.runtime_state?.thermal
  const devices = (data?.devices?.devices ?? []) as Record<string, any>[]

  // Il feed sta in `configuration.feed`, non al primo livello: cercandolo
  // in cima la ricerca falliva sempre e ENTRAMBE le camere ricadevano sullo
  // stato RGB aggregato — una camera destra guasta risultava STREAMING.
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

export type ReadinessLevel = 'ready' | 'degraded' | 'unavailable'

export function readinessLevel(sensors: SensorReadiness[]): ReadinessLevel {
  const readyCount = sensors.filter((s) => s.ready).length
  if (readyCount === sensors.length) return 'ready'
  if (readyCount === 0) return 'unavailable'
  return 'degraded'
}

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  ready: 'Ready to operate',
  degraded: 'Partially available',
  unavailable: 'Not operational',
}

export const READINESS_COLOR: Record<ReadinessLevel, string> = {
  ready: 'var(--accent-ok)',
  degraded: 'var(--accent-warn)',
  unavailable: 'var(--accent-critical)',
}
