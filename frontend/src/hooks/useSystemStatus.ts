/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Polling hook for host diagnostics (`/system`).
 */

import { api } from '../api/client'
import type { SystemDiagnostics } from '../api/types'
import { usePolling } from './usePolling'

const MIN_INTERVAL_MS = 10000

/** /system blocks on the server (~100 ms, psutil.cpu_percent): never poll faster than every 10 s. */
export function useSystemStatus(intervalMs = MIN_INTERVAL_MS) {
  const safeInterval = Math.max(intervalMs, MIN_INTERVAL_MS)
  return usePolling<SystemDiagnostics>(() => api.getSystem(), { intervalMs: safeInterval })
}
