import { useState } from 'react'
import { StatusBadge } from '../status/StatusBadge'
import { toneForAvailability } from '../status/severityColors'
import type { Availability } from '../../api/types'

interface VideoPanelProps {
  feed: 'rgb_left' | 'rgb_right'
  label: string
  availability: Availability
}

export function VideoPanel({ feed, label, availability }: VideoPanelProps) {
  const [error, setError] = useState(false)
  const tone = toneForAvailability(availability)

  const handleError = () => {
    setError(true)
  }

  const handleLoad = () => {
    setError(false)
  }

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
      {/* Header with label and status badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {label}
        </h3>
        <StatusBadge tone={tone} text={availability} />
      </div>

      {/* Video stream or error placeholder */}
      <div
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
        {error || availability === 'ERROR' || availability === 'NOT_PRESENT' ? (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            <p style={{ margin: '0 0 8px 0' }}>Feed non disponibile</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
              {availability === 'ERROR' && 'Errore di connessione'}
              {availability === 'NOT_PRESENT' && 'Dispositivo non presente'}
              {error && 'Impossibile caricare lo stream'}
            </p>
          </div>
        ) : (
          <img
            src={`/video/${feed}`}
            alt={label}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={handleError}
            onLoad={handleLoad}
          />
        )}
      </div>
    </div>
  )
}
