import { api } from '../api/client'
import type { SystemDiagnostics } from '../api/types'
import { usePolling } from './usePolling'

const MIN_INTERVAL_MS = 10000

/** /system è bloccante lato server (~100ms, psutil.cpu_percent): non scendere sotto i 10s. */
export function useSystemStatus(intervalMs = MIN_INTERVAL_MS) {
  const safeInterval = Math.max(intervalMs, MIN_INTERVAL_MS)
  return usePolling<SystemDiagnostics>(() => api.getSystem(), { intervalMs: safeInterval })
}
