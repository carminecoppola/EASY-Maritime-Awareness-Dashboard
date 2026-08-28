import { useState } from 'react'
import { api, ApiError } from '../../api/client'
import type { Session } from '../../api/types'

interface SessionStartFormProps {
  currentSession: Session | null
  isRunning: boolean
  onSessionChanged: () => void
}

export function SessionStartForm({ currentSession, isRunning, onSessionChanged }: SessionStartFormProps) {
  const [mode, setMode] = useState('live')
  const [operator, setOperator] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      await api.startSession({
        mode: mode || undefined,
        operator: operator || undefined,
        notes: notes || undefined,
      })
      setMode('live')
      setOperator('')
      setNotes('')
      onSessionChanged()
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError('Failed to start session')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    setError(null)
    try {
      await api.stopSession()
      onSessionChanged()
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError('Failed to stop session')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Session Control
      </h3>

      {!isRunning ? (
        <>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
              Mode
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontFamily: 'inherit',
              }}
            >
              <option value="live">Live</option>
              <option value="replay">Replay</option>
              <option value="replay_folder">Replay Folder</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
              Operator
            </label>
            <input
              type="text"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              disabled={loading}
              placeholder="e.g., operator name"
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
              placeholder="Optional session notes"
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                minHeight: 60,
                resize: 'vertical',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: 'var(--space-2)',
              background: 'var(--accent-critical-dim)',
              border: '1px solid var(--accent-critical)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-critical)',
              fontSize: 12,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--accent-ok)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Starting...' : 'Start Session'}
          </button>
        </>
      ) : (
        <>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            <p>
              Session running since{' '}
              <span className="mono">{currentSession?.start_time}</span>
            </p>
            {currentSession?.operator && (
              <p>Operator: <span className="mono">{currentSession.operator}</span></p>
            )}
          </div>

          {error && (
            <div style={{
              padding: 'var(--space-2)',
              background: 'var(--accent-critical-dim)',
              border: '1px solid var(--accent-critical)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-critical)',
              fontSize: 12,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleStop}
            disabled={loading}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--accent-critical)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Stopping...' : 'Stop Session'}
          </button>
        </>
      )}
    </div>
  )
}
