/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Mission state and the stop action, shared by the top bar and the mission bar.
 */

import { useCallback, useState } from 'react'
import { api } from '../api/client'
import { normalizeApiError } from '../lib/errors'
import { getPreference } from '../lib/preferences'
import { useSharedDashboardState } from './DashboardStateContext'

/** End-of-mission confirmation, which can be turned off in the browser settings. */
export function confirmEndMission(sessionId: string | null | undefined): boolean {
  if (!getPreference('confirmEndMission')) return true
  const label = sessionId ? `mission "${sessionId}"` : 'the current mission'
  return window.confirm(`End ${label}? Capture and detection recording will stop.`)
}

/**
 * Mission state and stop action shared by the top bar and the mission bar.
 * Starting needs operator, mode and notes and stays on the Mission page: only
 * stopping is exposed here, and it asks for confirmation because it is destructive.
 */
export function useMissionControl() {
  const { data } = useSharedDashboardState()
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const session = data?.session?.current ?? null
  const running = data?.session?.running ?? false

  const stop = useCallback(async () => {
    if (stopping) return
    if (!confirmEndMission(session?.session_id)) return
    setStopping(true)
    setError(null)
    try {
      await api.stopSession()
    } catch (e) {
      setError(normalizeApiError(e, 'session-stop').message)
    } finally {
      setStopping(false)
    }
  }, [session, stopping])

  return { session, running, stop, stopping, error }
}

/** Elapsed time derived from the real start_time, never from a fake timer. Format HH:MM:SS. */
export function elapsedSince(startTime: string | null | undefined, now: number): string | null {
  if (!startTime) return null
  const started = new Date(startTime).getTime()
  if (Number.isNaN(started)) return null
  const seconds = Math.max(0, Math.floor((now - started) / 1000))
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}
