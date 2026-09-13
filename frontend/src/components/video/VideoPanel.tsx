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
  // Il bordo riflette lo stato reale invece di restare sempre neutro —
  // il feed video è il contenuto primario della pagina, deve leggersi
  // "vivo" quando streamma davvero, non solo quando lo dice il badge.
  const borderColor = availability === 'STREAMING' ? 'var(--accent-ok)' : 'var(--border-subtle)'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-2)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-panel)',
        overflow: 'hidden',
        minHeight: 240,
        transition: 'border-color 0.3s ease',
      }}
    >
      <div
        ref={mediaRef}
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-1)',
          overflow: 'hidden',
          aspectRatio: '4/3',
          minHeight: 180,
        }}
      >
        {/* Overlay diretto sul frame, non sopra il pannello — il video è
            il contenuto primario, l'etichetta/stato sono un'informazione
            sovrapposta, come in un vero feed di sorveglianza. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-2) var(--space-3)',
            background: 'linear-gradient(to bottom, rgba(4,6,10,0.85), rgba(4,6,10,0))',
          }}
        >
          <h3 className="mono" style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
            {label}
          </h3>
          <StatusBadge tone={tone} text={availability} />
        </div>

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
