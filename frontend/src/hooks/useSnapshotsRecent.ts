/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Polling hook for the most recent snapshots.
 */

import { api } from '../api/client'
import type { SnapshotsRecentResponse } from '../api/types'
import { usePolling } from './usePolling'

/** Poll the latest `limit` snapshots every `intervalMs` (default 5 s). */
export function useSnapshotsRecent(limit = 24, intervalMs = 5000) {
  return usePolling<SnapshotsRecentResponse>(() => api.getSnapshotsRecent(limit), { intervalMs })
}
