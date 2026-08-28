import { useCallback, useState } from 'react'
import { api } from '../../api/client'

interface SnapshotActionsProps {
  onSnapshotTaken?: () => void
}

export function SnapshotActions({ onSnapshotTaken }: SnapshotActionsProps) {
  const [loading, setLoading] = useState<'rgb_left' | 'rgb_right' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleTakeSnapshot = useCallback(
    async (feed: 'rgb_left' | 'rgb_right') => {
      setLoading(feed)
      setError(null)
      setSuccess(null)
      try {
        await api.takeSnapshot(feed)
        setSuccess(`${feed === 'rgb_left' ? 'RGB Left' : 'RGB Right'} snapshot captured`)
        onSnapshotTaken?.()
        setTimeout(() => setSuccess(null), 3000)
      } catch (e) {
        setError(`Capture failed: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setLoading(null)
      }
    },
    [onSnapshotTaken],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          onClick={() => handleTakeSnapshot('rgb_left')}
          disabled={loading !== null}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: loading === 'rgb_left' ? 'var(--accent-warn)' : 'var(--accent-interactive)',
            color: loading === 'rgb_left' ? 'var(--bg-0)' : 'var(--bg-0)',
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading && loading !== 'rgb_left' ? 0.5 : 1,
            transition: 'all 150ms ease-out',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'var(--accent-interactive-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'var(--accent-interactive)'
            }
          }}
        >
          {loading === 'rgb_left' ? 'Capturing...' : 'Capture RGB Left'}
        </button>
        <button
          onClick={() => handleTakeSnapshot('rgb_right')}
          disabled={loading !== null}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: loading === 'rgb_right' ? 'var(--accent-warn)' : 'var(--accent-interactive)',
            color: loading === 'rgb_right' ? 'var(--bg-0)' : 'var(--bg-0)',
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading && loading !== 'rgb_right' ? 0.5 : 1,
            transition: 'all 150ms ease-out',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'var(--accent-interactive-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'var(--accent-interactive)'
            }
          }}
        >
          {loading === 'rgb_right' ? 'Capturing...' : 'Capture RGB Right'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: 'var(--space-2)',
            background: 'var(--accent-critical-dim)',
            border: `1px solid var(--accent-critical)`,
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--accent-critical)',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 'var(--space-2)',
            background: 'var(--accent-ok-dim)',
            border: `1px solid var(--accent-ok)`,
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--accent-ok)',
          }}
        >
          {success}
        </div>
      )}
    </div>
  )
}
