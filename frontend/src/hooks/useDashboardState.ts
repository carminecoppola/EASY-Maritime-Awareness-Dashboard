import { useCallback } from 'react'
import { api } from '../api/client'
import type { DashboardState } from '../api/types'
import { usePolling } from './usePolling'

/**
 * Fonte primaria di dati per la Live Overview. Il backend calcola
 * detection/session una sola volta per questa risposta aggregata: non
 * frammentare in chiamate separate a /api/detections/current o
 * /api/session/status quando questo hook è già montato.
 */
export function useDashboardState(intervalMs = 2000, params: { eventsLimit?: number; snapshotsLimit?: number } = {}) {
  const { eventsLimit, snapshotsLimit } = params
  const fetcher = useCallback(
    () => api.getDashboardState({ events_limit: eventsLimit, snapshots_limit: snapshotsLimit }),
    [eventsLimit, snapshotsLimit],
  )
  return usePolling<DashboardState>(fetcher, { intervalMs })
}
