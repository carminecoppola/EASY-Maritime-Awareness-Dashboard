import { Link } from 'react-router-dom'
import { toneForSeverity } from '../status/severityColors'
import { toDate } from '../../utils/formatTime'
import type { RawLogEvent } from '../../api/types'

interface ActivityTimelineProps {
  events: RawLogEvent[]
  loading: boolean
  error: boolean
  maxRows?: number
}

const SEVERITY_GLYPH: Record<string, string> = {
  INFO: 'i',
  LOW: '✓',
  MEDIUM: '!',
  HIGH: '!',
  CRITICAL: '×',
}

function dayLabel(date: Date): string {
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  return sameDay ? 'Today' : date.toLocaleDateString()
}

export function ActivityTimeline({ events, loading, error, maxRows = 6 }: ActivityTimelineProps) {
  const rows = events.slice(0, maxRows)

  return (
    <article className="easy-panel">
      <div className="easy-activityhead">
        <h2>Recent activity</h2>
        <Link className="easy-link" to="/thermal-events">
          View all events →
        </Link>
      </div>

      {error && <p className="easy-empty">Activity log unavailable — the last update could not be retrieved.</p>}
      {!error && loading && rows.length === 0 && <p className="easy-empty">Loading activity…</p>}
      {!error && !loading && rows.length === 0 && <p className="easy-empty">No activity recorded yet.</p>}

      {rows.length > 0 && (
        <div className="easy-events">
          {rows.map((event) => {
            const severity = String(event.severity || 'INFO').toUpperCase()
            const tone = toneForSeverity(severity)
            const date = toDate(event.timestamp)
            return (
              <div className="easy-event" key={event.id}>
                {/* La data completa è visibile, non solo nel tooltip: il log
                    contiene giorni diversi e un evento vecchio non deve
                    sembrare odierno. */}
                <span className="easy-event-time" title={date?.toLocaleString() ?? 'Unknown time'}>
                  {date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}
                  <br />
                  {date ? dayLabel(date) : ''}
                </span>
                <span className="easy-event-icon" style={{ color: tone.color }} aria-hidden>
                  {SEVERITY_GLYPH[severity] ?? '•'}
                </span>
                <div>
                  <b>{event.description}</b>
                  <small>
                    {severity}
                    {event.action || event.type ? ` · ${event.action || event.type}` : ''}
                  </small>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}
