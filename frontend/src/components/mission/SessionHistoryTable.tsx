import { Fragment, useState, type CSSProperties } from 'react'
import { api } from '../../api/client'
import { ManifestStats } from './ManifestStats'
import { StatusBadge } from '../status/StatusBadge'
import { toneForRunningStatus } from '../status/severityColors'
import type { SessionListItem } from '../../hooks/useSessionList'
import type { SessionManifestCounts } from '../../api/types'

interface SessionHistoryTableProps {
  sessions: SessionListItem[]
  loading: boolean
  onRefresh: () => Promise<void>
}

const thStyle: CSSProperties = {
  padding: 'var(--space-2)',
  textAlign: 'left',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  textTransform: 'uppercase',
  fontSize: 11,
  letterSpacing: '0.04em',
}

export function SessionHistoryTable({ sessions, loading, onRefresh }: SessionHistoryTableProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  // Per-sessione, non un unico booleano condiviso: prima, espandere una
  // seconda riga mentre la prima era ancora in caricamento mostrava
  // "Loading manifest..." su ENTRAMBE.
  const [loadingSessionIds, setLoadingSessionIds] = useState<Set<string>>(new Set())
  const [manifestCounts, setManifestCounts] = useState<Record<string, SessionManifestCounts>>({})

  const handleExpandSession = async (session: SessionListItem) => {
    const sessionId = session.session_id
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null)
      return
    }

    setExpandedSessionId(sessionId)
    if (manifestCounts[sessionId]) {
      return
    }
    // /api/session/list già include manifest.counts per ogni sessione
    // (verificato contro un payload reale): prima si rifaceva sempre un GET
    // /api/session/manifest separato ad ogni espansione, anche quando il
    // dato era già disponibile qui.
    if (session.manifest?.counts) {
      setManifestCounts((prev) => ({ ...prev, [sessionId]: session.manifest!.counts! }))
      return
    }

    setLoadingSessionIds((prev) => new Set(prev).add(sessionId))
    try {
      const manifest = await api.getSessionManifest(sessionId)
      setManifestCounts((prev) => ({
        ...prev,
        [sessionId]: manifest.counts,
      }))
    } catch (e) {
      console.error('Failed to load manifest:', e)
    } finally {
      setLoadingSessionIds((prev) => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
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
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sessions yet</div>
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
            minHeight: 36,
            padding: '8px 14px',
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={thStyle}>Session ID</th>
              <th style={thStyle}>Start Time</th>
              <th style={thStyle}>Duration</th>
              <th style={thStyle}>Operator</th>
              <th style={thStyle}>Mode</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session, idx) => {
              const isExpanded = expandedSessionId === session.session_id
              return (
                // Un singolo <tbody> deve avvolgere tutte le righe: un
                // <tbody> annidato per sessione è HTML non valido.
                <Fragment key={session.session_id}>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: idx % 2 === 0 ? 'transparent' : 'var(--bg-2)',
                    }}
                  >
                    <td
                      title={session.session_id}
                      style={{ padding: 'var(--space-2)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 11 }}
                    >
                      {session.session_id.substring(0, 24)}
                    </td>
                    <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)' }}>{formatDate(session.start_time)}</td>
                    <td style={{ padding: 'var(--space-2)', color: 'var(--text-primary)' }}>{formatDuration(session.duration)}</td>
                    <td style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>{session.operator || '—'}</td>
                    <td style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>{session.mode || '—'}</td>
                    <td style={{ padding: 'var(--space-2)' }}>
                      <StatusBadge tone={toneForRunningStatus(session.status)} text={session.status} />
                    </td>
                    <td style={{ padding: 'var(--space-2)' }}>
                      <button
                        onClick={() => handleExpandSession(session)}
                        aria-expanded={isExpanded}
                        aria-controls={`manifest-${session.session_id}`}
                        style={{
                          minHeight: 36,
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {isExpanded ? '▼ Collapse' : '▶ Manifest'}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr id={`manifest-${session.session_id}`} style={{ background: 'var(--bg-1)' }}>
                      <td colSpan={7} style={{ padding: 'var(--space-3)' }}>
                        {loadingSessionIds.has(session.session_id) && !manifestCounts[session.session_id] ? (
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
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
