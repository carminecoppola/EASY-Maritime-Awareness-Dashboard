/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Mission (session) list, loaded on mount and refreshed on demand.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { api, ApiError } from '../api/client'

/**
 * Real shape of a session as returned by /api/session/list.
 * Keep it in sync with the backend payload.
 */
export interface SessionListItem {
  ok: boolean
  session_id: string
  start_time: string
  end_time: string
  duration: number
  status: 'RUNNING' | 'STOPPED'
  mode: string
  operator: string
  hostname: string
  model_name: string
  model_type: string
  project_version: string
  notes: string
  editable?: {
    campaign?: string | null
    location?: string | null
    notes?: string
    operator?: string
    weather?: string | null
  }
  manifest?: {
    counts?: {
      by_feed: Record<string, number>
      detections: number
      inference: number
      items: number
      paired_items: number
      paired_capture_sets?: number
      within_tolerance_samples?: number
      samples: number
      snapshots: number
      synchronized_samples: number
    }
    path: string
    schema: string
  }
  metrics?: Record<string, unknown>
  paths?: Record<string, string>
  updated_at: string
}

/** The sessions plus loading and error state and a manual refresh. */
interface UseSessionListResult {
  sessions: SessionListItem[]
  error: unknown
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * Hook for the session list. It needs no aggressive polling because the list
 * rarely changes: it fetches on mount and refreshes manually from a UI button.
 */
export function useSessionList(): UseSessionListResult {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  // Incremented on every refresh: when two requests are in flight (e.g. a quick
  // click on "Refresh" plus the automatic refresh after a start/stop), only the
  // answer of the most recent request is applied. Without this, an older answer
  // arriving later could overwrite fresher data already shown.
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const response = await api.getSessionList()
      if (requestId !== requestIdRef.current) return
      // Safe cast: the declared return type is { sessions: unknown[] }
      const sessionsList = (response as { sessions: unknown[] }).sessions as SessionListItem[]
      setSessions(sessionsList)
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      setError(e)
      if (e instanceof ApiError) {
        console.error('Failed to load session list:', e.message, e.body)
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { sessions, error, loading, refresh }
}
