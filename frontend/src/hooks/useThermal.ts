/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Thermal hooks: status polling, the cached live frame and the manual capture.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, withCacheBuster } from '../api/client'
import type { ThermalStatusResponse } from '../api/types'
import { usePolling } from './usePolling'

/** Poll the thermal status every `intervalMs` (default 3 s). */
export function useThermalStatus(intervalMs = 3000) {
  return usePolling<ThermalStatusResponse>(() => api.getThermalStatus(), { intervalMs })
}

/**
 * `/thermal/last-frame` is cheap (it uses the server cache, 204 when absent) and
 * can be polled. `/thermal/frame` captures a NEW frame on every call (expensive):
 * call it only on a manual trigger, never in a polling loop.
 */
export function useThermalLastFrame(intervalMs = 2500, enabled = true) {
  // The URL must be regenerated ONLY on each polling tick, not on each render:
  // the cache buster (Date.now()) used to be recomputed on every render, so any
  // re-render unrelated to polling restarted the image fetch outside the
  // intended interval.
  const [url, setUrl] = useState(() => withCacheBuster('/thermal/last-frame'))

  usePolling(
    useCallback(async () => {
      setUrl(withCacheBuster('/thermal/last-frame'))
      return null
    }, []),
    { intervalMs, enabled },
  )

  return { url }
}

/** How long a manual capture stays on screen before returning to the live frame. */
const MANUAL_CAPTURE_DISPLAY_MS = 4000

/** Manual thermal capture: fetches a new frame (15 s limit), shows it for a few seconds and releases its blob URL. */
export function useThermalManualCapture() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [url, setUrl] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      mountedRef.current = false
      clearTimeout(revertTimerRef.current)
      // A hardware capture lasts up to 15 s: if the operator changes page in the
      // meantime, without an abort the blob would be allocated for an already
      // unmounted component and never revoked.
      abortRef.current?.abort()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    [],
  )

  const capture = useCallback(async () => {
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    // Without a timeout, a stuck thermal sensor leaves the button on
    // "Capturing..." indefinitely: fetch() alone has no limit.
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      // It must really wait for the hardware capture (fetching the blob), not just
      // assign a URL: loading used to go true->false synchronously in the same
      // handler, so the loading UI never became observable and the button was
      // never disabled during a real capture.
      const response = await fetch('/thermal/frame', { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (!mountedRef.current) return
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const objectUrl = URL.createObjectURL(blob)
      objectUrlRef.current = objectUrl
      setUrl(objectUrl)
      // The manually captured frame used to stay "frozen" in the UI forever even
      // though /thermal/last-frame polling continued in the background. After a
      // display window it returns to the polled live frame, also revoking the
      // object URL, which would otherwise stay allocated until the next capture or
      // unmount (a small but real memory leak).
      clearTimeout(revertTimerRef.current)
      revertTimerRef.current = setTimeout(() => {
        setUrl(null)
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = null
        }
      }, MANUAL_CAPTURE_DISPLAY_MS)
    } catch (e) {
      if (mountedRef.current) setError(e)
    } finally {
      clearTimeout(timeout)
      if (abortRef.current === controller) abortRef.current = null
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  return { capture, loading, error, url }
}
