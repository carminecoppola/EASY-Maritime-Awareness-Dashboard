import { useEffect, useRef } from 'react'
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

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  )
}

export function SnapshotLightbox({ snapshot, onClose }: SnapshotLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  // Callers (SnapshotGallery is fed by polling) commonly pass a fresh
  // `onClose` arrow on every render. Depending on `onClose` directly made
  // this effect re-run — and its cleanup steal focus back — on every poll
  // tick, bouncing keyboard focus and making the dialog unusable. A ref
  // decouples "read the latest onClose" from "the effect's identity".
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    // Senza focus trap/restore, un operatore che naviga a tastiera può
    // continuare a tabbare sulla Sidebar/TopBar sotto l'overlay mentre il
    // modal resta aperto, e il focus non torna mai all'elemento che ha
    // aperto la lightbox alla chiusura.
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const focusable = dialogRef.current ? getFocusable(dialogRef.current) : []
    focusable[0]?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = getFocusable(dialogRef.current)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot.filename
    // identifies "which snapshot is open"; onClose is read via ref above so
    // an unstable caller-provided identity can't restart this effect.
  }, [snapshot.filename])

  return (
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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Snapshot ${snapshot.filename}`}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Filename
            </span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 4 }}>{snapshot.filename}</div>
          </div>

          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Created
            </span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 4 }}>
              {new Date(snapshot.created || '').toLocaleString()}
            </div>
          </div>

          {snapshot.size_bytes !== undefined && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Size
              </span>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 4 }}>
                {formatBytes(snapshot.size_bytes)}
              </div>
            </div>
          )}
        </div>

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
              Download
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
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
