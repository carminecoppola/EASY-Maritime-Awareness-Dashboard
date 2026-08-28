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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <button
        onClick={handleTakeSnapshot}
        disabled={loading}
        style={{
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          background: loading ? 'var(--accent-warn)' : 'var(--accent-interactive)',
          color: loading ? 'var(--bg-0)' : 'var(--bg-0)',
          border: 'none',
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
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
        {loading ? 'Capturing...' : 'Capture Thermal Snapshot'}
      </button>

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
