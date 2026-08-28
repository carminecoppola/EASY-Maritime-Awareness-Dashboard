import { useCallback, useEffect, useRef, useState } from 'react'
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
export function useThermalLastFrame(intervalMs = 2500, enabled = true) {
  // L'URL va rigenerato SOLO ad ogni tick di polling, non ad ogni render:
  // prima il cache-buster (Date.now()) veniva ricalcolato a ogni render
  // del componente, quindi un re-render qualsiasi (non legato al polling)
  // faceva ripartire il fetch dell'immagine anche fuori dall'intervallo
  // previsto.
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

const MANUAL_CAPTURE_DISPLAY_MS = 4000

export function useThermalManualCapture() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [url, setUrl] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      clearTimeout(revertTimerRef.current)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    [],
  )

  const capture = useCallback(async () => {
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    // Senza timeout, un sensore termico bloccato lascia il bottone su
    // "Capturing..." indefinitamente: fetch() da solo non ha un limite.
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      // Deve attendere davvero la cattura hardware (fetch del blob), non
      // solo assegnare un URL: prima loading passava true->false in modo
      // sincrono nello stesso handler, quindi il cooldown/UI di caricamento
      // non diventava mai osservabile — il bottone non si disabilitava mai
      // durante una cattura reale.
      const response = await fetch('/thermal/frame', { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const objectUrl = URL.createObjectURL(blob)
      objectUrlRef.current = objectUrl
      setUrl(objectUrl)
      // Il frame catturato manualmente non veniva mai rimosso: restava
      // "congelato" in UI per sempre anche se il polling di /thermal/last-frame
      // proseguiva in background. Dopo una finestra di visualizzazione,
      // torna al frame live pollato — revocando anche l'object URL, che
      // altrimenti restava allocato fino alla cattura successiva o
      // all'unmount (piccolo ma reale memory leak).
      clearTimeout(revertTimerRef.current)
      revertTimerRef.current = setTimeout(() => {
        setUrl(null)
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = null
        }
      }, MANUAL_CAPTURE_DISPLAY_MS)
    } catch (e) {
      setError(e)
    } finally {
      clearTimeout(timeout)
      setLoading(false)
    }
  }, [])

  return { capture, loading, error, url }
}
