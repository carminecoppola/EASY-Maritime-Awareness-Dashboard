import { useMemo, useState } from 'react'
import { TabFilter } from '../common/TabFilter'
import { toDate } from '../../utils/formatTime'
import { mostRecentFirst } from '../../utils/sorting'
import type { MissionEvent, RawLogEvent } from '../../api/types'

export type EventKind = 'thermal' | 'ai' | 'system'

export interface StreamEvent {
  id: string
  timestamp: string
  kind: EventKind
  label: string
  description: string
  source: string
  status: string
}

const FILTERS: { id: 'all' | EventKind; label: string }[] = [
  { id: 'all', label: 'All events' },
  { id: 'thermal', label: 'Thermal' },
  { id: 'ai', label: 'AI detection' },
]

const KIND_LABEL: Record<EventKind, string> = {
  thermal: 'THERMAL',
  ai: 'AI DETECTION',
  system: 'SYSTEM',
}

function kindOfLogEvent(event: RawLogEvent): EventKind {
  const haystack = `${event.source} ${event.type} ${event.description}`.toLowerCase()
  if (haystack.includes('thermal')) return 'thermal'
  return 'system'
}

/**
 * Unisce due feed reali distinti in un solo flusso, mantenendo esplicita la
 * provenienza: gli eventi di missione derivano dalle detection AI, il log di
 * attività riporta sensori e salvataggi.
 */
export function buildStream(logEvents: RawLogEvent[], missionEvents: MissionEvent[]): StreamEvent[] {
  const fromLog: StreamEvent[] = logEvents.map((event) => ({
    id: `log-${event.id}`,
    timestamp: event.timestamp,
    kind: kindOfLogEvent(event),
    label: event.description,
    description: event.action || event.type,
    source: event.source,
    status: String(event.severity || '').toUpperCase(),
  }))

  const fromMission: StreamEvent[] = missionEvents.map((event) => ({
    id: `mission-${event.event_id}`,
    timestamp: event.created_at,
    kind: 'ai',
    label: event.type,
    description: event.track_id ? `Track ${event.track_id}` : event.severity,
    source: event.source_label || event.source,
    status: event.status,
  }))

  return mostRecentFirst([...fromLog, ...fromMission])
}

interface EventStreamProps {
  events: StreamEvent[]
  loading: boolean
  error: boolean
  maxRows?: number
}

export function EventStream({ events, loading, error, maxRows = 12 }: EventStreamProps) {
  const [filter, setFilter] = useState<'all' | EventKind>('all')

  const visible = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.kind === filter)).slice(0, maxRows),
    [events, filter, maxRows],
  )

  return (
    <section className="easy-surface easy-eventstream">
      <div className="easy-panelhead">
        <h2>Mission event stream</h2>
        <TabFilter options={FILTERS} value={filter} onChange={setFilter} label="Event type filter" panelId="event-stream-panel" />
        <span className="easy-panelnote" style={{ marginLeft: 'auto' }}>
          Newest first
        </span>
      </div>

      <div id="event-stream-panel" role="tabpanel" aria-label="Mission event stream">
      {error ? (
        <p className="easy-error" style={{ margin: 14 }}>
          Event stream unavailable — the last update could not be retrieved.
        </p>
      ) : loading && events.length === 0 ? (
        <p className="easy-empty" style={{ margin: 14 }}>
          Loading events…
        </p>
      ) : visible.length === 0 ? (
        <p className="easy-empty" style={{ margin: 14 }}>
          {filter === 'all' ? 'No events recorded yet.' : `No ${filter} events recorded yet.`}
        </p>
      ) : (
        <div className="easy-tablewrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="easy-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Type</th>
                <th scope="col">Event</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => {
                const date = toDate(event.timestamp)
                return (
                  <tr key={event.id}>
                    <td className="mono" title={date?.toLocaleString()}>
                      {date ? date.toLocaleTimeString(undefined, { hour12: false }) : '—'}
                      <br />
                      {date ? date.toLocaleDateString() : ''}
                    </td>
                    <td>
                      <span className={`easy-tag easy-eventtype ${event.kind}`}>{KIND_LABEL[event.kind]}</span>
                    </td>
                    <td className="easy-cell-strong">
                      {event.label}
                      {event.description ? <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{event.description}</div> : null}
                    </td>
                    <td>{event.source || '—'}</td>
                    <td>{event.status || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </section>
  )
}
