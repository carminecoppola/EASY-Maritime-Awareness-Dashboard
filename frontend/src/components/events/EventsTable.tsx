import { StatusBadge } from '../status/StatusBadge'
import { toneForSeverity, toneForEventStatus } from '../status/severityColors'

export interface EventTableRow {
  id: string
  timestamp: string
  label: string
  /** Severity or status value (e.g. "INFO", "WARNING", "CRITICAL", "NEW", "ACTIVE") */
  severity_or_status?: string
  description?: string
  [key: string]: unknown
}

interface EventsTableProps {
  rows: EventTableRow[]
  title?: string
  maxRows?: number
  /**
   * Determines how to color the status badge.
   * 'severity': use toneForSeverity (for mission events)
   * 'status': use toneForEventStatus (for detection status)
   * @default 'severity'
   */
  statusType?: 'severity' | 'status'
}

export function EventsTable({
  rows,
  title,
  maxRows = 10,
  statusType = 'severity',
}: EventsTableProps) {
  const displayRows = rows.slice(0, maxRows)

  const getTone = (value?: string) => {
    if (!value) return { color: 'var(--text-muted)', dim: 'var(--bg-3)', label: '—' }
    return statusType === 'severity' ? toneForSeverity(value) : toneForEventStatus(value)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {title && (
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </h3>
      )}

      <div
        style={{
          overflowX: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Timestamp
              </th>
              <th
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Label
              </th>
              <th
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Status
              </th>
              <th
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Nessun evento
                </td>
              </tr>
            ) : (
              displayRows.map((row, index) => (
                // The backend's raw event log can emit duplicate ids across
                // distinct entries (observed in practice), so the id alone
                // is not a safe React key.
                <tr
                  key={`${row.id}-${index}`}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <td style={{ padding: 'var(--space-2) var(--space-3)', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                      {new Date(row.timestamp).toLocaleTimeString('it-IT', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-primary)' }}>
                    {row.label}
                  </td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                    {row.severity_or_status && (
                      <StatusBadge tone={getTone(row.severity_or_status)} text={row.severity_or_status} />
                    )}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      color: 'var(--text-secondary)',
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.description}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > maxRows && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
          {rows.length - maxRows} evento/i aggiuntivi (mostrando {maxRows} più recenti)
        </p>
      )}
    </div>
  )
}
