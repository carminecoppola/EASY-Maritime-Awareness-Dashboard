/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Thermal sensor card: latest frame, readiness, and the capture actions.
 */

import { useState } from 'react'
import { api } from '../../api/client'
import { normalizeApiError } from '../../lib/errors'
import { useThermalLastFrame, useThermalManualCapture } from '../../hooks/useThermal'
import { toDate } from '../../utils/formatTime'
import type { DashboardState, RuntimeState } from '../../api/types'

/** The part of the thermal status this panel reads. */
interface ThermalPayload {
  status?: string
  device?: string
  error?: string
  mode?: string
  /** Epoch in seconds (time.time()); 0 means no frame acquired. */
  last_frame_ts?: number | string | null
  runtime_state?: RuntimeState
}

/** Headline text and colour for an availability value. */
function headline(availability: string, detected: boolean): { text: string; color: string } {
  if (availability === 'READY' || availability === 'STREAMING') {
    return { text: 'Ready for capture', color: 'var(--accent-ok)' }
  }
  if (availability === 'INITIALIZING') return { text: 'Starting up', color: 'var(--accent-warn)' }
  if (availability === 'ERROR') return { text: 'Sensor error', color: 'var(--accent-critical)' }
  return { text: detected ? 'Not available' : 'Sensor not detected', color: 'var(--text-muted)' }
}

/** Shows the cached live frame, device and status, plus *Capture thermal* and *Save paired set* (needs a running mission). */
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
  // The capture time comes from the backend, not from when the URL changes: an
  // old frame must not look freshly acquired.
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
          // /thermal/last-frame answers 204 until a frame exists: without onError the
          // broken-image icon would remain.
          <img src={frameUrl} alt="Latest thermal capture" onError={() => setFrameMissing(true)} />
        ) : (
          <p className="easy-thermal-placeholder">No thermal frame available</p>
        )}
        <span className="easy-stamp mono">
          {lastFrameAt ? lastFrameAt.toLocaleString() : 'Capture time unknown'}
        </span>
      </div>

      <div className="easy-thermalcopy">
        <div className="easy-kicker">Thermal sensor · continuous</div>
        <h3>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: state.color, display: 'inline-block' }} />
          {state.text}
        </h3>
        <p>The persistent thermal worker runs beside both RGB views. Saving a snapshot does not interrupt acquisition.</p>

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
            title={missionRunning ? undefined : 'Start a mission before capturing a paired sensor set'}
          >
            {setPending ? 'Saving…' : 'Save paired set'}
          </button>
        </div>
      </div>
    </article>
  )
}
