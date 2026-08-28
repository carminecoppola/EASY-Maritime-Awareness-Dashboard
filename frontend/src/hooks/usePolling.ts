import { useEffect, useRef, useState } from 'react'

interface UsePollingOptions {
  intervalMs: number
  enabled?: boolean
  backoffMaxMs?: number
}

interface UsePollingResult<T> {
  data: T | null
  error: unknown
  loading: boolean
}

/**
 * Polling generico con backoff esponenziale sugli errori e pausa automatica
 * quando la tab è in background (risparmia CPU/rete, coerente con il budget
 * di risorse del Raspberry Pi che ospita il backend).
 */
export function usePolling<T>(fn: () => Promise<T>, opts: UsePollingOptions): UsePollingResult<T> {
  const { intervalMs, enabled = true, backoffMaxMs = 30000 } = opts
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const failuresRef = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let hasFetchedOnce = false

    const scheduleNext = (delay: number) => {
      timer = setTimeout(tick, delay)
    }

    async function tick() {
      // La pausa su tab in background si applica solo ai poll successivi al
      // primo: senza il primo fetch la UI resterebbe bloccata su "loading"
      // per sempre se la pagina si monta già in background.
      if (hasFetchedOnce && document.hidden) {
        scheduleNext(intervalMs)
        return
      }
      hasFetchedOnce = true
      try {
        const result = await fnRef.current()
        if (cancelled) return
        setData(result)
        setError(null)
        setLoading(false)
        failuresRef.current = 0
        scheduleNext(intervalMs)
      } catch (e) {
        if (cancelled) return
        setError(e)
        setLoading(false)
        failuresRef.current += 1
        const backoff = Math.min(intervalMs * 2 ** failuresRef.current, backoffMaxMs)
        scheduleNext(backoff)
      }
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, intervalMs, backoffMaxMs])

  return { data, error, loading }
}
