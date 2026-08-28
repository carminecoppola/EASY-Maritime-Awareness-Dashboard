import { api } from '../api/client'
import type { SnapshotsRecentResponse } from '../api/types'
import { usePolling } from './usePolling'

export function useSnapshotsRecent(limit = 24, intervalMs = 5000) {
  return usePolling<SnapshotsRecentResponse>(() => api.getSnapshotsRecent(limit), { intervalMs })
}
