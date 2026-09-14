import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { normalizeApiError } from '../../lib/errors'
import { confirmEndMission, elapsedSince } from '../../hooks/useMissionControl'
import type { Session, SessionManifestCounts } from '../../api/types'

interface ActiveMissionPanelProps {
  session: Session | null
  counts: SessionManifestCounts | null
  /** Sensori pronti su totale, per la metrica di readiness. */
  sensorsReady: number
  sensorsTotal: number
  now: number
  onChanged: () => void
  /** Chiamata solo dopo uno stop confermato dal backend. */
  onStopped?: () => void
}

function metricValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '—'
}

export function ActiveMissionPanel({
  session,
  counts,
  sensorsReady,
  sensorsTotal,
  now,
  onChanged,
  onStopped,
}: ActiveMissionPanelProps) {
  const [capturing, setCapturing] = useState(false)
  const [ending, setEnding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const elapsed = elapsedSince(session?.start_time, now)

  const handleCaptureSet = async () => {
    if (capturing) return
    setCapturing(true)
    setMessage(null)
    setError(null)
    try {
      const result = await api.captureAcquisitionSet()
      setMessage(
        result.complete
          ? `Capture set ${result.capture_set_id} saved`
          : `Partial capture set: ${result.successful_feeds}/${result.total_feeds} feeds saved`,
      )
      onChanged()
    } catch (e) {
      setError(normalizeApiError(e, 'capture-set').message)
    } finally {
      setCapturing(false)
    }
  }

  const handleEnd = async () => {
    if (ending) return
    if (!confirmEndMission(session?.session_id)) return
    setEnding(true)
    setError(null)
    try {
      await api.stopSession()
      ;(onStopped ?? onChanged)()
    } catch (e) {
      setError(normalizeApiError(e, 'session-stop').message)
    } finally {
      setEnding(false)
    }
  }

  return (
    <article className="easy-panel">
      <div className="easy-missionhero">
        <span className="easy-pulse" aria-hidden />
        <div>
          <h2 className="mono">{session?.session_id ?? 'Mission active'}</h2>
          <p>Mission is recording metadata and ready for coordinated captures.</p>
        </div>
        <div className="easy-timer">
          <b>{elapsed ?? '—'}</b>
          <span>Elapsed time</span>
        </div>
      </div>

      <div className="easy-missionmetrics">
        <div className="easy-metric">
          <b>{metricValue(counts?.synchronized_samples)}</b>
          <span>Capture sets</span>
        </div>
        <div className="easy-metric">
          <b>{metricValue(counts?.detections)}</b>
          <span>Detections</span>
        </div>
        <div className="easy-metric">
          <b>{metricValue(counts?.snapshots)}</b>
          <span>Saved snapshots</span>
        </div>
        <div className="easy-metric">
          <b>
            {sensorsReady}/{sensorsTotal}
          </b>
          <span>Sensors ready</span>
        </div>
      </div>

      {message && <p className="easy-empty">{message}</p>}
      {error && <p className="easy-error">{error}</p>}

      <div className="easy-missionactions">
        <button type="button" className="easy-btn primary" onClick={handleCaptureSet} disabled={capturing}>
          {capturing ? 'Capturing…' : 'Capture synchronized set'}
        </button>
        <Link className="easy-btn" to="/">
          Open live feeds
        </Link>
        <button type="button" className="easy-btn danger" onClick={handleEnd} disabled={ending}>
          {ending ? 'Ending…' : 'End mission'}
        </button>
      </div>
    </article>
  )
}
