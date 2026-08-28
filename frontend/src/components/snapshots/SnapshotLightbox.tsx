import { useEffect } from 'react'
import type { Snapshot } from '../../api/types'

interface SnapshotLightboxProps {
  snapshot: Snapshot
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export function SnapshotLightbox({ snapshot, onClose }: SnapshotLightboxProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            maxWidth: '90vw',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {/* Immagine full-size */}
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <img
              src={snapshot.url}
              alt={snapshot.filename}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                display: 'block',
              }}
            />
          </div>

          {/* Metadati */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Nome File
              </span>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 4 }}>
                {snapshot.filename}
              </div>
            </div>

            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Data Creazione
              </span>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 4 }}>
                {new Date(snapshot.created || '').toLocaleString()}
              </div>
            </div>

            {snapshot.size_bytes !== undefined && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Dimensione
                </span>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 4 }}>
                  {formatBytes(snapshot.size_bytes)}
                </div>
              </div>
            )}
          </div>

          {/* Bottoni */}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {snapshot.download_url && (
              <a
                href={snapshot.download_url}
                download={snapshot.filename}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-interactive)',
                  color: 'var(--bg-0)',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: 'background 150ms ease-out',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-interactive-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--accent-interactive)'
                }}
              >
                Scarica
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 150ms ease-out',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-interactive)'
                e.currentTarget.style.color = 'var(--accent-interactive)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
