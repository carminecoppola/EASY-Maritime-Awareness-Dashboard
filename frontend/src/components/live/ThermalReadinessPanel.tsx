import { useState } from 'react'
import { api } from '../../api/client'
import { normalizeApiError } from '../../lib/errors'
import { useThermalLastFrame, useThermalManualCapture } from '../../hooks/useThermal'
import { toDate } from '../../utils/formatTime'
import type { DashboardState, RuntimeState } from '../../api/types'

interface ThermalPayload {
  status?: string
  device?: string
  error?: string
  mode?: string
  /** Epoch in secondi (time.time()); 0 = nessun frame acquisito. */
  last_frame_ts?: number | string | null
  runtime_state?: RuntimeState
}

function headline(availability: string, detected: boolean): { text: string; color: string } {
  if (availability === 'READY' || availability === 'STREAMING') {
    return { text: 'Ready for capture', color: 'var(--accent-ok)' }
  }
  if (availability === 'INITIALIZING') return { text: 'Starting up', color: 'var(--accent-warn)' }
  if (availability === 'ERROR') return { text: 'Sensor error', color: 'var(--accent-critical)' }
  return { text: detected ? 'Not available' : 'Sensor not detected', color: 'var(--text-muted)' }
}

export function ThermalReadinessPanel({ data }: { data: DashboardState | null }) {
  const thermal = (data?.health?.thermal ?? {}) as ThermalPayload
  const runtime = data?.health?.runtime_state?.thermal
  const availability = runtime?.availability ?? 'NOT_PRESENT'
  const ready = availability === 'READY' || availability === 'STREAMING'
  const missionRunning = data?.session?.running ?? false

  const { url: liveUrl } = useThermalLastFrame(2500, ready)
  const manual = useThermalManualCapture()
  const [setPending, setSetPending] = useState(false)
  const [frameMissing, setFrameMissing] = useState(false)
  const [setMessage, setSetMessage] = useState<string | null>(null)

  const state = headline(availability, Boolean(runtime?.detected))
  // L'ora di cattura viene dal backend, non dal momento in cui l'URL
  // cambia: un frame vecchio non deve sembrare appena acquisito.
  const lastFrameAt = toDate(thermal.last_frame_ts)
  const frameUrl = manual.url ?? (ready ? liveUrl : null)

  const handleCaptureSet = async () => {
    if (setPending) return
    setSetPending(true)
    setSetMessage(null)
    try {
      const result = await api.captureAcquisitionSet()
      setSetMessage(
        result.complete
          ? `Saved capture set ${result.capture_set_id}`
          : `Partial set: ${result.successful_feeds}/${result.total_feeds} feeds saved`,
      )
    } catch (e) {
      setSetMessage(normalizeApiError(e, 'capture-set').message)
    } finally {
      setSetPending(false)
    }
  }

  return (
    <article className="easy-panel easy-thermal">
      <div className="easy-thermalimg">
        {frameUrl && !frameMissing ? (
          // /thermal/last-frame risponde 204 finché non esiste un frame:
          // senza onError restava l'icona di immagine rotta.
          <img src={frameUrl} alt="Latest thermal capture" onError={() => setFrameMissing(true)} />
        ) : (
          <p className="easy-thermal-placeholder">No thermal frame available</p>
        )}
        <span className="easy-stamp mono">
          {lastFrameAt ? lastFrameAt.toLocaleString() : 'Capture time unknown'}
        </span>
      </div>

      <div className="easy-thermalcopy">
        <div className="easy-kicker">Thermal sensor · on demand</div>
        <h3>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: state.color, display: 'inline-block' }} />
          {state.text}
        </h3>
        <p>
          The thermal sensor is captured on request and releases the device between frames — it is not a continuous
          stream.
        </p>

        <div className="easy-thermalmeta">
          <div>
            <b>{thermal.device || '—'}</b>
            <span>Device</span>
          </div>
          <div>
            <b>{lastFrameAt ? lastFrameAt.toLocaleTimeString(undefined, { hour12: false }) : '—'}</b>
            <span>Last capture</span>
          </div>
          <div>
            <b>{thermal.status || availability}</b>
            <span>Sensor status</span>
          </div>
        </div>

        {(manual.error || thermal.error || setMessage) && (
          <p className="easy-sub" style={{ marginTop: 8 }}>
            {setMessage || thermal.error || 'Thermal capture failed'}
          </p>
        )}

        <div className="easy-thermalactions">
          <button type="button" className="easy-btn info" onClick={manual.capture} disabled={!ready || manual.loading}>
            {manual.loading ? 'Capturing…' : 'Capture thermal'}
          </button>
          <button
            type="button"
            className="easy-btn"
            onClick={handleCaptureSet}
            disabled={!missionRunning || setPending}
            title={missionRunning ? undefined : 'Start a mission before capturing a synchronized sensor set'}
          >
            {setPending ? 'Saving…' : 'Save synchronized set'}
          </button>
        </div>
      </div>
    </article>
  )
}
