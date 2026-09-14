import { useCallback, useState } from 'react'
import { api } from '../api/client'
import { normalizeApiError } from '../lib/errors'
import { getPreference } from '../lib/preferences'
import { useSharedDashboardState } from './DashboardStateContext'

/** Conferma di fine missione, disattivabile dalle impostazioni del browser. */
export function confirmEndMission(sessionId: string | null | undefined): boolean {
  if (!getPreference('confirmEndMission')) return true
  const label = sessionId ? `mission "${sessionId}"` : 'the current mission'
  return window.confirm(`End ${label}? Capture and detection recording will stop.`)
}

/**
 * Stato missione + arresto condivisi da top bar e barra missione. L'avvio
 * richiede operatore/modo/note e resta sulla pagina Mission: qui si espone
 * solo lo stop, che è distruttivo e quindi chiede conferma.
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

/** Durata in corso derivata da start_time reale, mai da un timer fittizio. */
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
