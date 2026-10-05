/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Shared polling of `/api/dashboard/state` for the whole application.
 */

import { createContext, useContext, type ReactNode } from 'react'
import { useDashboardState } from './useDashboardState'
import type { DashboardState } from '../api/types'

/** Polling result: data, last error, loading flag, consecutive failures, last success time and a manual refresh. */
interface DashboardStateContextValue {
  data: DashboardState | null
  error: unknown
  loading: boolean
  failures: number
  lastSuccessAt: number | null
  refresh: () => void
}

const DashboardStateContext = createContext<DashboardStateContextValue | null>(null)

/**
 * Mounts a single polling instance on /api/dashboard/state for the whole app,
 * shared by the top bar (global health) and the pages, so the same aggregated
 * call is not duplicated in several components.
 */
export function DashboardStateProvider({ children }: { children: ReactNode }) {
  // Without explicit limits /api/dashboard/state returns the whole event log and
  // the whole gallery (about 3.4 MB, ~2.5 s per request): with a 2 s interval
  // the requests exceeded the client timeout and were aborted, leaving the
  // dashboard without data. Pages that need full lists use their own dedicated
  // endpoints.
  // 3 s, not 2: the answer takes ~2 s on the Raspberry, so at 2 s the next
  // request would start almost on top of the previous one.
  const value = useDashboardState(3000, { eventsLimit: 50, snapshotsLimit: 12 })
  return <DashboardStateContext.Provider value={value}>{children}</DashboardStateContext.Provider>
}

/** Read the shared dashboard state (must be used inside `DashboardStateProvider`). */
export function useSharedDashboardState(): DashboardStateContextValue {
  const ctx = useContext(DashboardStateContext)
  if (!ctx) {
    throw new Error('useSharedDashboardState must be used within DashboardStateProvider')
  }
  return ctx
}
