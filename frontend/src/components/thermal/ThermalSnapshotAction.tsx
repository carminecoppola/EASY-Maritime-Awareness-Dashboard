import { useCallback, useState } from 'react'
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* Styled as a secondary (outline) action, not the same solid blue as
          "Capture Now" above — the two looked like duplicate buttons doing
          the same thing, when this one actually captures AND permanently
          saves the frame to the archive, unlike the few-second preview. */}
      <button
        onClick={handleTakeSnapshot}
        disabled={loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '11px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          color: loading ? 'var(--text-muted)' : 'var(--accent-interactive)',
          border: `1px solid ${loading ? 'var(--border-subtle)' : 'var(--accent-interactive)'}`,
          fontSize: 13,
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
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        Captures a frame and saves it permanently — visible on the Snapshots page
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
