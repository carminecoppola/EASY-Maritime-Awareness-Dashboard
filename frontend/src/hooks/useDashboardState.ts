/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Polling hook for the aggregated dashboard state.
 */

import { useCallback } from 'react'
import { api } from '../api/client'
import type { DashboardState } from '../api/types'
import { usePolling } from './usePolling'

/**
 * Primary data source for the Live Overview. The backend computes
 * detections and session state once for this aggregated response: do not split
 * it into separate calls to /api/detections/current or /api/session/status
 * while this hook is already mounted.
 */
export function useDashboardState(intervalMs = 2000, params: { eventsLimit?: number; snapshotsLimit?: number } = {}) {
  const { eventsLimit, snapshotsLimit } = params
  const fetcher = useCallback(
    () => api.getDashboardState({ events_limit: eventsLimit, snapshots_limit: snapshotsLimit }),
    [eventsLimit, snapshotsLimit],
  )
  return usePolling<DashboardState>(fetcher, { intervalMs })
}
