/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Generic polling hook with exponential back-off, tab-visibility awareness and manual refresh.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface UsePollingOptions {
  intervalMs: number
  enabled?: boolean
  backoffMaxMs?: number
}

interface UsePollingResult<T> {
  data: T | null
  error: unknown
  loading: boolean
  /** Consecutive failures: 1 is not an outage yet, 3 or more is. */
  failures: number
  /** Time of the last valid response, to state the age of the data. */
  lastSuccessAt: number | null
  /** Forces an immediate request without starting a second polling loop. */
  refresh: () => void
}

/** Background tab: slow down instead of stopping altogether (see the note below). */
const HIDDEN_TAB_SLOWDOWN = 4

/**
 * Generic polling with exponential back-off on errors.
 *
 * When the tab is in the background it slows down by HIDDEN_TAB_SLOWDOWN times
 * instead of stopping: an earlier implementation stopped fetching entirely
 * while `document.hidden` was true, but an environment where the tab is
 * permanently "hidden" (a kiosk display, an embedded wrapper, or simply a
 * headless browser) never emits `visibilitychange` to restart it, and the
 * dashboard stayed stuck on the data of the last fetch forever. Slowing down
 * instead of stopping guarantees progress in every circumstance while still
 * saving CPU and network when second-by-second reactivity is not needed.
 */
export function usePolling<T>(fn: () => Promise<T>, opts: UsePollingOptions): UsePollingResult<T> {
  const { intervalMs, enabled = true, backoffMaxMs = 30000 } = opts
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [failures, setFailures] = useState(0)
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const failuresRef = useRef(0)
  const tickRef = useRef<() => void>(() => {})
  const fnRef = useRef(fn)
  // Assigning a ref during render is not safe in StrictMode/concurrent mode:
  // the shared poller could read the fetcher of a discarded render.
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    if (!enabled) {
      // Without this, a consumer that mounts the hook with enabled=false (e.g. to
      // enable it later on user interaction) stays stuck on loading=true forever,
      // because no tick ever updates it.
      setLoading(false)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let inFlight = false

    const nextDelay = () => (document.hidden ? intervalMs * HIDDEN_TAB_SLOWDOWN : intervalMs)

    const scheduleNext = (delay: number) => {
      clearTimeout(timer)
      timer = setTimeout(tick, delay)
    }

    async function tick() {
      if (inFlight) return
      inFlight = true
      try {
        const result = await fnRef.current()
        if (cancelled) return
        setData(result)
        setError(null)
        setLoading(false)
        setLastSuccessAt(Date.now())
        failuresRef.current = 0
        setFailures(0)
        scheduleNext(nextDelay())
      } catch (e) {
        if (cancelled) return
        setError(e)
        setLoading(false)
        failuresRef.current += 1
        setFailures(failuresRef.current)
        const backoff = Math.min(nextDelay() * 2 ** failuresRef.current, backoffMaxMs)
        scheduleNext(backoff)
      } finally {
        inFlight = false
      }
    }

    // When the tab returns to the foreground, fetch immediately instead of
    // waiting for the next slowed-down tick, so the operator never sees stale
    // data on coming back.
    const handleVisibilityChange = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    tickRef.current = tick
    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, intervalMs, backoffMaxMs])

  // A manual retry reuses the same loop: it does not open a second one.
  const refresh = useCallback(() => {
    tickRef.current()
  }, [])

  return { data, error, loading, failures, lastSuccessAt, refresh }
}
