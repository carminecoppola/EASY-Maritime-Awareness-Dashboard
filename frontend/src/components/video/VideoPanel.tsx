import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { toDate } from '../../utils/formatTime'
import { DetectionOverlay } from './DetectionOverlay'
import type { Availability, Detection } from '../../api/types'

interface VideoPanelProps {
  feed: 'rgb_left' | 'rgb_right'
  label: string
  availability: Availability
  /**
   * Detection correnti da disegnare come overlay. Il backend non offre oggi
   * un modo affidabile per attribuire una detection a rgb_left vs rgb_right
   * (source_label riflette la sorgente del frame provider, es. "Replay
   * Folder", non il lato fisico) — le stesse detection vengono quindi
   * mostrate su entrambi i pannelli finché il backend non espone
   * un'attribuzione per-lato.
   */
  detections?: Detection[]
  /** FPS reale della camera (health.cameras.rgb_cameras); omesso se assente. */
  fps?: number | null
  /** Ultima acquisizione riportata dalla camera: epoch in secondi o ISO. */
  lastAcquisitionTs?: number | string | null
  /** Messaggio d'errore della camera, mostrato nello stato non disponibile. */
  cameraError?: string | null
}

const AVAILABILITY_REASON: Record<Availability, string> = {
  STREAMING: '',
  READY: 'Camera ready but not streaming',
  INITIALIZING: 'Camera is starting up',
  NOT_PRESENT: 'Device not present',
  ERROR: 'Camera reported an error',
}

export function VideoPanel({
  feed,
  label,
  availability,
  detections = [],
  fps,
  lastAcquisitionTs,
  cameraError,
}: VideoPanelProps) {
  const [imageError, setImageError] = useState(false)
  const cardRef = useRef<HTMLElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureMessage, setCaptureMessage] = useState<string | null>(null)

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageError(false)
    // Misura la risoluzione nativa direttamente dall'immagine servita,
    // invece di assumere una risoluzione fissa: elimina il disallineamento
    // dei bounding box quando la risoluzione reale differisce da un valore
    // hardcoded (successo in precedenza: 640x480 assunto vs 1280x480 reale).
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }

  const handleCapture = async () => {
    if (capturing) return
    setCapturing(true)
    setCaptureMessage(null)
    try {
      await api.takeSnapshot(feed)
      setCaptureMessage('Captured')
    } catch (e) {
      setCaptureMessage(e instanceof Error ? `Capture failed: ${e.message}` : 'Capture failed')
    } finally {
      setCapturing(false)
    }
  }

  const handleExpand = () => {
    const node = cardRef.current
    if (!node) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      node.requestFullscreen?.()
    }
  }

  const streaming = availability === 'STREAMING'
  const showFeed = !(imageError || availability === 'ERROR' || availability === 'NOT_PRESENT')

  // last_acquisition_ts è un epoch in secondi (time.time()): passarlo a
  // new Date() direttamente mostrava un orario del 1970 come "ultimo frame".
  const lastFrameAt = toDate(lastAcquisitionTs)
  const frameInfo = captureMessage
    ? captureMessage
    : lastFrameAt
      ? `Last frame ${lastFrameAt.toLocaleTimeString(undefined, { hour12: false })}`
      : streaming
        ? 'Streaming'
        : AVAILABILITY_REASON[availability] || availability

  return (
    <article ref={cardRef} className={`easy-feed${streaming ? ' streaming' : ''}`}>
      <div className="easy-feed-media" ref={mediaRef}>
        {showFeed ? (
          <>
            <img src={`/video/${feed}`} alt={`${label} camera feed`} onError={() => setImageError(true)} onLoad={handleLoad} />
            {naturalSize && detections.length > 0 && (
              <DetectionOverlay
                detections={detections}
                containerRef={mediaRef}
                nativeWidth={naturalSize.width}
                nativeHeight={naturalSize.height}
              />
            )}
          </>
        ) : (
          <div className="easy-feed-empty">
            <p style={{ margin: 0 }}>Feed unavailable</p>
            <p style={{ margin: 0, fontSize: 11 }}>
              {cameraError || (imageError ? 'Unable to load the stream' : AVAILABILITY_REASON[availability] || availability)}
            </p>
          </div>
        )}
      </div>

      <div className="easy-feed-scrim" aria-hidden />

      <div className="easy-feedtop">
        <span className="easy-feedname">{label}</span>
        {streaming ? (
          <span className="easy-live">LIVE</span>
        ) : (
          <span className="easy-chip">{availability.replace('_', ' ')}</span>
        )}
        <div className="easy-telemetry">
          {typeof fps === 'number' && <span className="easy-chip">{fps.toFixed(1)} FPS</span>}
        </div>
      </div>

      <div className="easy-feedbottom">
        <span className="easy-frameinfo">{frameInfo}</span>
        <div className="easy-feedbuttons">
          <button type="button" className="easy-ghost" onClick={handleCapture} disabled={capturing || !showFeed}>
            {capturing ? 'Capturing…' : 'Capture'}
          </button>
          <button type="button" className="easy-ghost" onClick={handleExpand}>
            Expand
          </button>
        </div>
      </div>
    </article>
  )
}
