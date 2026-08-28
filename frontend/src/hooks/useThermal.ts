import { useCallback, useState } from 'react'
import { api, withCacheBuster } from '../api/client'
import type { ThermalStatusResponse } from '../api/types'
import { usePolling } from './usePolling'

export function useThermalStatus(intervalMs = 3000) {
  return usePolling<ThermalStatusResponse>(() => api.getThermalStatus(), { intervalMs })
}

/**
 * `/thermal/last-frame` è economico (usa la cache lato server, 204 se
 * assente) ed è pollabile. `/thermal/frame` cattura un NUOVO frame ad ogni
 * chiamata (costoso): va invocato solo a trigger manuale, mai in polling.
 */
export function useThermalLastFrame(intervalMs = 2500) {
  const [nonce, setNonce] = useState(0)
  const url = withCacheBuster(`/thermal/last-frame?frame=${nonce}`)

  usePolling(
    useCallback(async () => {
      setNonce((n) => n + 1)
      return null
    }, []),
    { intervalMs },
  )

  return { url }
}

export function useThermalManualCapture() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [url, setUrl] = useState<string | null>(null)

  const capture = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUrl(withCacheBuster('/thermal/frame'))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  return { capture, loading, error, url }
}
