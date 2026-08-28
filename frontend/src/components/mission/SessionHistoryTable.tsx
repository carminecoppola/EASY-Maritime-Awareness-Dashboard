import { useState } from 'react'
import { api } from '../../api/client'
import { ManifestStats } from './ManifestStats'
import type { SessionListItem } from '../../hooks/useSessionList'
import type { SessionManifestCounts } from '../../api/types'

interface SessionHistoryTableProps {
  sessions: SessionListItem[]
  loading: boolean
  onRefresh: () => Promise<void>
}

export function SessionHistoryTable({ sessions, loading, onRefresh }: SessionHistoryTableProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [manifestLoading, setManifestLoading] = useState(false)
  const [manifestCounts, setManifestCounts] = useState<Record<string, SessionManifestCounts>>({})

  const handleExpandSession = async (sessionId: string) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null)
      return
    }

    setExpandedSessionId(sessionId)
    if (manifestCounts[sessionId]) {
      return
    }

    setManifestLoading(true)
    try {
      const manifest = await api.getSessionManifest(sessionId)
      setManifestCounts(prev => ({
        ...prev,
        [sessionId]: manifest.counts,
      }))
    } catch (e) {
      console.error('Failed to load manifest:', e)
    } finally {
      setManifestLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
  }

  if (sessions.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        No sessions yet
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Session History ({sessions.length})
        </h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            padding: '4px 12px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Updating...' : 'Refresh'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{
                padding: 'var(--space-2)',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
                letterSpacing: '0.04em',
              }}>Session ID</th>
              <th style={{
                padding: 'var(--space-2)',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
                letterSpacing: '0.04em',
              }}>Start Time</th>
              <th style={{
                padding: 'var(--space-2)',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
                letterSpacing: '0.04em',
              }}>Duration</th>
              <th style={{
                padding: 'var(--space-2)',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
                letterSpacing: '0.04em',
              }}>Operator</th>
              <th style={{
                padding: 'var(--space-2)',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
                letterSpacing: '0.04em',
              }}>Mode</th>
              <th style={{
                padding: 'var(--space-2)',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
                letterSpacing: '0.04em',
              }}>Status</th>
              <th style={{
                padding: 'var(--space-2)',
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: 11,
                letterSpacing: '0.04em',
              }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session, idx) => (
              <tbody key={session.session_id}>
                <tr style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: idx % 2 === 0 ? 'transparent' : 'var(--bg-2)',
                }}>
                  <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 11 }}>
                    {session.session_id.substring(0, 12)}...
                  </td>
                  <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)' }}>
                    {formatDate(session.start_time)}
                  </td>
                  <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)' }}>
                    {formatDuration(session.duration)}
                  </td>
                  <td style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    {session.operator || '—'}
                  </td>
                  <td style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    {session.mode || '—'}
                  </td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 600,
                      background: session.status === 'STOPPED' ? 'var(--accent-ok-dim)' : 'var(--accent-warn-dim)',
                      color: session.status === 'STOPPED' ? 'var(--accent-ok)' : 'var(--accent-warn)',
                    }}>
                      {session.status}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <button
                      onClick={() => handleExpandSession(session.session_id)}
                      style={{
                        padding: '2px 8px',
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      {expandedSessionId === session.session_id ? '▼ Collapse' : '▶ Manifest'}
                    </button>
                  </td>
                </tr>

                {expandedSessionId === session.session_id && (
                  <tr style={{ background: 'var(--bg-1)' }}>
                    <td colSpan={7} style={{ padding: 'var(--space-3)' }}>
                      {manifestLoading ? (
                        <div style={{ color: 'var(--text-muted)' }}>Loading manifest...</div>
                      ) : (
                        <ManifestStats
                          counts={manifestCounts[session.session_id] ?? null}
                          title={`Manifest for ${session.session_id}`}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
