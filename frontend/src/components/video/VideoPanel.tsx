import { useRef, useState } from 'react'
import { StatusBadge } from '../status/StatusBadge'
import { toneForAvailability } from '../status/severityColors'
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
}

export function VideoPanel({ feed, label, availability, detections = [] }: VideoPanelProps) {
  const [error, setError] = useState(false)
  const mediaRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const tone = toneForAvailability(availability)

  const handleError = () => {
    setError(true)
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setError(false)
    // Misura la risoluzione nativa direttamente dall'immagine servita,
    // invece di assumere una risoluzione fissa: elimina il disallineamento
    // dei bounding box quando la risoluzione reale differisce da un valore
    // hardcoded (successo in precedenza: 640x480 assunto vs 1280x480 reale).
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }

  const showFeed = !(error || availability === 'ERROR' || availability === 'NOT_PRESENT')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        minHeight: 240,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</h3>
        <StatusBadge tone={tone} text={availability} />
      </div>

      <div
        ref={mediaRef}
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-1)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          aspectRatio: '4/3',
          minHeight: 180,
        }}
      >
        {showFeed ? (
          <>
            <img
              src={`/video/${feed}`}
              alt={label}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={handleError}
              onLoad={handleLoad}
            />
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
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <p style={{ margin: '0 0 8px 0' }}>Feed unavailable</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
              {availability === 'ERROR' && 'Connection error'}
              {availability === 'NOT_PRESENT' && 'Device not present'}
              {error && 'Unable to load the stream'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
