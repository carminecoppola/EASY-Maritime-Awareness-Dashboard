import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { useThermalLastFrame } from '../../hooks/useThermal'
import { toDate } from '../../utils/formatTime'
import type { ThermalStatusResponse } from '../../api/types'

interface ThermalViewerPanelProps {
  status: ThermalStatusResponse | null
  onCaptured: () => void
}

export function ThermalViewerPanel({ status, onCaptured }: ThermalViewerPanelProps) {
  const availability = status?.runtime_state?.availability ?? 'NOT_PRESENT'
  const ready = availability === 'READY' || availability === 'STREAMING'

  const [frozen, setFrozen] = useState(false)
  const [frozenUrl, setFrozenUrl] = useState<string | null>(null)
  const [imageMissing, setImageMissing] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLElement>(null)

  const { url: liveUrl } = useThermalLastFrame(2500, ready && !frozen)
  const shownUrl = frozen ? frozenUrl : liveUrl

  const lastFrameAt = toDate(status?.last_frame_ts as number | string | undefined)

  // Il 204 iniziale (nessun frame ancora catturato) marcava l'immagine come
  // mancante per sempre: dopo una cattura reale il pannello restava vuoto
  // fino a un reload.
  useEffect(() => setImageMissing(false), [shownUrl])

  const handleFreeze = () => {
    if (frozen) {
      setFrozen(false)
      setFrozenUrl(null)
      return
    }
    setFrozenUrl(liveUrl)
    setFrozen(true)
  }

  const handleExpand = () => {
    const node = cardRef.current
    if (!node) return
    if (document.fullscreenElement) document.exitFullscreen()
    else node.requestFullscreen?.()
  }

  const handleCapture = async () => {
    if (capturing) return
    setCapturing(true)
    setMessage(null)
    setError(null)
    try {
      const result = await api.takeThermalSnapshot()
      setMessage(`Snapshot saved${result.snapshot?.filename ? `: ${result.snapshot.filename}` : ''}`)
      onCaptured()
    } catch (e) {
      setError(e instanceof Error ? `Capture failed: ${e.message}` : 'Capture failed')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <article className="easy-surface" ref={cardRef}>
      <div className="easy-panelhead">
        <h2>Latest thermal frame</h2>
        <span className="easy-panelnote">On-demand capture · not a continuous stream</span>
        <div className="easy-tools">
          <button type="button" className="easy-btn mini" onClick={handleFreeze} disabled={!ready}>
            {frozen ? 'Resume live' : 'Freeze'}
          </button>
          <button type="button" className="easy-btn mini" onClick={handleExpand}>
            Expand
          </button>
        </div>
      </div>

      <div className="easy-viewer">
        {shownUrl && !imageMissing ? (
          <img src={shownUrl} alt="Latest thermal frame" onError={() => setImageMissing(true)} />
        ) : (
          <p className="easy-viewer-empty">
            {ready ? 'No thermal frame captured yet.' : `Thermal sensor ${availability.replace('_', ' ').toLowerCase()}.`}
          </p>
        )}
        <div className="easy-viewer-scrim" aria-hidden />

        <div className="easy-over top">
          <span className={`easy-badge ${frozen ? 'frozen' : 'thermal'}`}>
            {frozen ? 'FRAME FROZEN' : 'LATEST THERMAL'}
          </span>
          {status?.video_size ? (
            <span className="easy-mono">
              {String(status.video_size)} · {String(status.input_format ?? '').toUpperCase()}
            </span>
          ) : null}
        </div>

        <div className="easy-palette" aria-hidden title="Relative colour scale — not an absolute temperature map" />

        <div className="easy-over bottom">
          {/* L'ora è quella dichiarata dal backend per il frame, non il
              momento in cui l'immagine è stata richiesta. */}
          <span>{lastFrameAt ? `Captured ${lastFrameAt.toLocaleString()}` : 'Capture time unknown'}</span>
          <span className="easy-mono">
            {typeof status?.frame_seq === 'number' ? `frame #${status.frame_seq}` : 'no frame'}
          </span>
        </div>
      </div>

      <div className="easy-capturebar">
        <div>
          <b>Evidence capture</b>
          <small>{message ?? error ?? 'Saves the frame and its metadata to the snapshot archive'}</small>
        </div>
        <button type="button" className="easy-btn primary" onClick={handleCapture} disabled={!ready || capturing}>
          {capturing ? 'Saving…' : 'Capture thermal snapshot'}
        </button>
      </div>
    </article>
  )
}
