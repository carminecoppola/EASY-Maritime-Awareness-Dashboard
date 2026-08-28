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

/** Tab in background: rallenta invece di fermarsi del tutto (vedi nota sotto). */
const HIDDEN_TAB_SLOWDOWN = 4

/**
 * Polling generico con backoff esponenziale sugli errori.
 *
 * Quando la tab è in background rallenta di HIDDEN_TAB_SLOWDOWN× invece di
 * fermarsi: un'implementazione precedente smetteva del tutto di fare fetch
 * mentre `document.hidden` era true, ma un ambiente in cui la tab risulta
 * permanentemente "hidden" (kiosk display, wrapper embedded, o semplicemente
 * un browser headless) non emette mai `visibilitychange` per farla ripartire
 * — la dashboard restava bloccata sui dati dell'ultimo fetch per sempre.
 * Rallentare anziché fermarsi garantisce progresso in ogni circostanza,
 * mantenendo comunque il risparmio di CPU/rete quando non serve reattività
 * al secondo.
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
        failuresRef.current = 0
        scheduleNext(nextDelay())
      } catch (e) {
        if (cancelled) return
        setError(e)
        setLoading(false)
        failuresRef.current += 1
        const backoff = Math.min(nextDelay() * 2 ** failuresRef.current, backoffMaxMs)
        scheduleNext(backoff)
      } finally {
        inFlight = false
      }
    }

    // Al ritorno in primo piano, forza subito un fetch invece di aspettare
    // il prossimo tick rallentato — evita dati stantii percepibili quando
    // l'operatore torna sulla tab.
    const handleVisibilityChange = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, intervalMs, backoffMaxMs])

  return { data, error, loading }
}
