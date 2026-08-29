import { Fragment, useCallback, useState } from 'react'
import { api } from '../../api/client'

interface ThermalSnapshotActionProps {
  onSnapshotTaken?: () => void
}

export function ThermalSnapshotAction({ onSnapshotTaken }: ThermalSnapshotActionProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleTakeSnapshot = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await api.takeThermalSnapshot()
      setSuccess('Thermal snapshot captured')
      onSnapshotTaken?.()
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(`Capture failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [onSnapshotTaken])

  // Rendered as a child inside ThermalFrameViewer's button row, so the
  // button itself is small/inline (matching "Capture Now" beside it); the
  // explanation moved to a tooltip, and error/success messages force a new
  // line in that row via flexBasis: '100%' instead of being squeezed next
  // to the buttons.
  return (
    <Fragment>
      <button
        onClick={handleTakeSnapshot}
        disabled={loading}
        title="Captures a frame and saves it permanently — visible on the Snapshots page"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          color: loading ? 'var(--text-muted)' : 'var(--accent-interactive)',
          border: `1px solid ${loading ? 'var(--border-subtle)' : 'var(--accent-interactive)'}`,
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 150ms ease-out',
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.currentTarget.style.background = 'var(--accent-info-dim)'
          }
        }}
        onMouseLeave={(e) => {
          if (!loading) {
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        <span aria-hidden>⬇</span>
        {loading ? 'Saving...' : 'Save Snapshot to Archive'}
      </button>

      {error && (
        <div
          style={{
            flexBasis: '100%',
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
            flexBasis: '100%',
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
    </Fragment>
  )
}
