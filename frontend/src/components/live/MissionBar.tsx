import { useState } from 'react'
import { api } from '../../api/client'
import { normalizeApiError } from '../../lib/errors'
import { elapsedSince } from '../../hooks/useMissionControl'
import type { DashboardState } from '../../api/types'

interface MissionBarProps {
  data: DashboardState | null
  now: number
}

export function MissionBar({ data, now }: MissionBarProps) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const running = data?.session?.running ?? false
  const session = data?.session?.current ?? null
  if (!running) return null

  const elapsed = elapsedSince(session?.start_time, now)
  const captureSets = (data?.acquisition?.manifest_counts?.synchronized_samples ?? null) as number | null

  const handleCaptureSet = async () => {
    if (pending) return
    setPending(true)
    setMessage(null)
    try {
      const result = await api.captureAcquisitionSet()
      setMessage(result.complete ? 'Capture set saved' : `${result.successful_feeds}/${result.total_feeds} feeds saved`)
    } catch (e) {
      // Il backend spiega perché (409 = nessuna missione attiva): mostrare
      // "HTTP 409" all'operatore non gli dice cosa fare.
      setMessage(normalizeApiError(e, 'capture-set').message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="easy-missionbar" role="status">
      <span className="easy-dot" aria-hidden />
      <strong>MISSION ACTIVE</strong>
      <span className="easy-missionbar-meta mono">
        {session?.session_id ?? 'Active'}
        {elapsed ? ` · ${elapsed}` : ''}
        {typeof captureSets === 'number' ? ` · ${captureSets} capture sets` : ''}
        {message ? ` · ${message}` : ''}
      </span>
      <button type="button" className="easy-btn" onClick={handleCaptureSet} disabled={pending}>
        {pending ? 'Capturing…' : 'Capture set'}
      </button>
    </div>
  )
}
