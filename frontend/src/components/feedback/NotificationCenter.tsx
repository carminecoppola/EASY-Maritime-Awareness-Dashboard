import { useEffect, useMemo, useRef, useState } from 'react'
import { useSharedDashboardState } from '../../hooks/DashboardStateContext'
import { dedupeNotificationKey, formatStaleAge } from '../../lib/errors'
import { toDate } from '../../utils/formatTime'
import type { MissionEvent } from '../../api/types'

interface Notification {
  key: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  at: number | null
  count: number
  resolved: boolean
}

const SEVERITY_COLOR = {
  critical: 'var(--accent-critical)',
  warning: 'var(--accent-warn)',
  info: 'var(--accent-info)',
} as const

/**
 * Il badge conta guasti di sistema correnti ed eventi di missione HIGH o
 * CRITICAL non risolti — non i messaggi informativi storici. Le occorrenze
 * ripetute dello stesso problema aggiornano un contatore invece di
 * accumularsi.
 */
function buildNotifications(
  events: MissionEvent[],
  connectionFailures: number,
  lastSuccessAt: number | null,
): Notification[] {
  const grouped = new Map<string, Notification>()

  if (connectionFailures >= 2) {
    const key = dedupeNotificationKey('dashboard-state', 'unreachable')
    grouped.set(key, {
      key,
      severity: connectionFailures >= 3 ? 'critical' : 'warning',
      title: connectionFailures >= 3 ? 'Backend unreachable' : 'Connection unstable',
      detail: formatStaleAge(lastSuccessAt) ? `Last successful update ${formatStaleAge(lastSuccessAt)}` : 'No successful update yet',
      at: lastSuccessAt,
      count: connectionFailures,
      resolved: false,
    })
  }

  for (const event of events) {
    if (event.severity !== 'HIGH' && event.severity !== 'CRITICAL') continue
    const key = dedupeNotificationKey(event.source || 'mission', event.type)
    const at = toDate(event.created_at)?.getTime() ?? null
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      if (at && (!existing.at || at > existing.at)) existing.at = at
      existing.resolved = existing.resolved && event.status === 'RESOLVED'
      continue
    }
    grouped.set(key, {
      key,
      severity: event.severity === 'CRITICAL' ? 'critical' : 'warning',
      title: event.type,
      detail: `${event.source_label || event.source}${event.track_id ? ` · track ${event.track_id}` : ''}`,
      at,
      count: 1,
      resolved: event.status === 'RESOLVED',
    })
  }

  return Array.from(grouped.values()).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
}

export function NotificationCenter() {
  const { data, failures, lastSuccessAt } = useSharedDashboardState()
  const [open, setOpen] = useState(false)
  // Riconoscere nasconde il badge lato browser; non tocca lo stato backend
  // degli eventi, perché non esiste un endpoint di acknowledgement.
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  const events = (data?.events_current?.events ?? []) as MissionEvent[]
  const notifications = useMemo(
    () => buildNotifications(events, failures, lastSuccessAt),
    [events, failures, lastSuccessAt],
  )

  const needsAttention = notifications.filter((n) => !n.resolved && !acknowledged.includes(n.key))
  const resolved = notifications.filter((n) => n.resolved)
  const acknowledgedItems = notifications.filter((n) => !n.resolved && acknowledged.includes(n.key))

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="easy-bell"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          needsAttention.length > 0
            ? `Notifications: ${needsAttention.length} needing attention`
            : 'Notifications: nothing needs attention'
        }
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path
            d="M4.5 7.5a4.5 4.5 0 1 1 9 0c0 3 1.2 4.2 1.2 4.2H3.3s1.2-1.2 1.2-4.2ZM7.2 14.3a1.9 1.9 0 0 0 3.6 0"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {needsAttention.length > 0 && <em className="easy-bellcount">{needsAttention.length}</em>}
      </button>

      {open && (
        <div className="easy-notifications" role="dialog" aria-label="Notifications">
          <div className="easy-notifhead">
            <h2>Notifications</h2>
            {needsAttention.length > 0 && (
              <button
                type="button"
                className="easy-btn mini"
                style={{ marginLeft: 'auto' }}
                onClick={() => setAcknowledged(notifications.map((n) => n.key))}
              >
                Acknowledge all
              </button>
            )}
          </div>

          {notifications.length === 0 && <p className="easy-empty" style={{ margin: 14 }}>Nothing to report.</p>}

          {needsAttention.length > 0 && <div className="easy-notifsection">Needs attention</div>}
          {needsAttention.map((item) => (
            <div className="easy-notif" key={item.key} style={{ color: SEVERITY_COLOR[item.severity] }}>
              <i aria-hidden />
              <div style={{ minWidth: 0 }}>
                <b>{item.title}</b>
                <small>
                  {item.detail}
                  {item.at ? ` · ${new Date(item.at).toLocaleString()}` : ''}
                </small>
              </div>
              <span className="easy-notifcount">{item.count > 1 ? `×${item.count}` : ''}</span>
            </div>
          ))}

          {acknowledgedItems.length > 0 && <div className="easy-notifsection">Acknowledged</div>}
          {acknowledgedItems.map((item) => (
            <div className="easy-notif" key={item.key} style={{ color: 'var(--text-muted)' }}>
              <i aria-hidden />
              <div style={{ minWidth: 0 }}>
                <b>{item.title}</b>
                <small>Still active on the device</small>
              </div>
            </div>
          ))}

          {resolved.length > 0 && <div className="easy-notifsection">Resolved</div>}
          {resolved.map((item) => (
            <div className="easy-notif" key={item.key} style={{ color: 'var(--accent-ok)' }}>
              <i aria-hidden />
              <div style={{ minWidth: 0 }}>
                <b>{item.title}</b>
                <small>{item.detail}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
