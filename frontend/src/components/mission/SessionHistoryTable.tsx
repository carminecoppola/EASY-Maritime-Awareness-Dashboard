import { Fragment, useState } from 'react'
import { api } from '../../api/client'
import { ManifestStats } from './ManifestStats'
import { toneForRunningStatus } from '../status/severityColors'
import { toDate } from '../../utils/formatTime'
import type { SessionListItem } from '../../hooks/useSessionList'
import type { SessionManifestCounts } from '../../api/types'

interface SessionHistoryTableProps {
  sessions: SessionListItem[]
  loading: boolean
  error: unknown
  onRefresh: () => Promise<void>
}

function formatDate(value: string): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function SessionHistoryTable({ sessions, loading, error, onRefresh }: SessionHistoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Per-sessione, non un unico booleano condiviso: espandere una seconda riga
  // mentre la prima carica non deve mostrare "Loading" su entrambe.
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [manifests, setManifests] = useState<Record<string, SessionManifestCounts>>({})

  const handleExpand = async (session: SessionListItem) => {
    const id = session.session_id
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (manifests[id]) return
    // /api/session/list include già manifest.counts per ogni sessione
    // (verificato su un payload reale): niente GET separato quando c'è.
    if (session.manifest?.counts) {
      setManifests((prev) => ({ ...prev, [id]: session.manifest!.counts! }))
      return
    }
    setLoadingIds((prev) => new Set(prev).add(id))
    try {
      const manifest = await api.getSessionManifest(id)
      setManifests((prev) => ({ ...prev, [id]: manifest.counts }))
    } catch (e) {
      console.error('Failed to load manifest:', e)
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <section className="easy-history">
      <div className="easy-historyhead">
        <h2>Recent missions</h2>
        <div className="easy-historyactions">
          <span className="easy-sub" style={{ margin: 0 }}>
            {sessions.length} recorded
          </span>
          <button type="button" className="easy-btn mini" onClick={onRefresh} disabled={loading}>
            {loading ? 'Updating…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? (
        <p className="easy-error" style={{ margin: 14 }}>
          Failed to load session history
        </p>
      ) : sessions.length === 0 ? (
        <p className="easy-empty" style={{ margin: 14 }}>
          {loading ? 'Loading missions…' : 'No missions recorded yet.'}
        </p>
      ) : (
        <div className="easy-tablewrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="easy-table">
            <thead>
              <tr>
                <th scope="col">Mission</th>
                <th scope="col">Date</th>
                <th scope="col">Duration</th>
                <th scope="col">Capture sets</th>
                <th scope="col">Operator</th>
                <th scope="col">Status</th>
                <th scope="col">Manifest</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const expanded = expandedId === session.session_id
                const tone = toneForRunningStatus(session.status)
                const captureSets = session.manifest?.counts?.synchronized_samples
                return (
                  <Fragment key={session.session_id}>
                    <tr>
                      <td className="easy-cell-strong mono" title={session.session_id}>
                        {session.session_id}
                      </td>
                      <td>{formatDate(session.start_time)}</td>
                      <td className="mono">{formatDuration(session.duration)}</td>
                      <td className="mono">{typeof captureSets === 'number' ? captureSets : '—'}</td>
                      <td>{session.operator || '—'}</td>
                      <td>
                        <span className="easy-tag" style={{ color: tone.color }}>
                          {session.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="easy-btn mini"
                          onClick={() => handleExpand(session)}
                          aria-expanded={expanded}
                          aria-controls={`manifest-${session.session_id}`}
                        >
                          {expanded ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`manifest-${session.session_id}`}>
                        <td colSpan={7} style={{ background: 'var(--bg-1)' }}>
                          {loadingIds.has(session.session_id) && !manifests[session.session_id] ? (
                            <p className="easy-empty" style={{ margin: 0 }}>
                              Loading manifest…
                            </p>
                          ) : (
                            <ManifestStats
                              counts={manifests[session.session_id] ?? null}
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
      )}
    </section>
  )
}
