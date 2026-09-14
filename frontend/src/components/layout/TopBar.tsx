import { Link, useLocation } from 'react-router-dom'
import { useSharedDashboardState } from '../../hooks/DashboardStateContext'
import { useMissionControl } from '../../hooks/useMissionControl'
import { readinessLevel, READINESS_COLOR, sensorReadiness } from '../../lib/readiness'
import { formatRelativeTime } from '../../utils/formatTime'
import { titleForPath } from './navItems'
import { NotificationCenter } from '../feedback/NotificationCenter'
import { AccountMenu } from '../auth/AccountMenu'

interface Connection {
  color: string
  text: string
}

function connectionState(loading: boolean, hasError: boolean, ok: boolean | undefined): Connection {
  if (hasError) return { color: 'var(--accent-critical)', text: 'Disconnected' }
  if (loading && ok === undefined) return { color: 'var(--text-muted)', text: 'Connecting…' }
  if (ok) return { color: 'var(--accent-ok)', text: 'Operational' }
  return { color: 'var(--accent-warn)', text: 'Degraded' }
}

export function TopBar() {
  const { data, error, loading } = useSharedDashboardState()
  const { running, stop, stopping } = useMissionControl()
  const { pathname } = useLocation()

  const connection = connectionState(loading, Boolean(error), data?.ok)
  const sensors = sensorReadiness(data ?? null)
  const readyCount = sensors.filter((s) => s.ready).length
  const level = readinessLevel(sensors)
  const temperature = data?.health?.system?.cpu_temperature_c

  // L'errore di connessione non cancella l'ultimo stato ricevuto: il badge
  // dichiara la connessione, il title dichiara quanto è vecchio il dato.
  const lastUpdate = data?.timestamp ? formatRelativeTime(data.timestamp) : 'never'

  return (
    <header className="easy-topbar">
      <div className="easy-crumb">{titleForPath(pathname)}</div>
      <div className="easy-topstats">
        <div className="easy-status" title={`Last payload received ${lastUpdate}`}>
          <span className="easy-dot" style={{ background: connection.color }} aria-hidden />
          {connection.text}
        </div>
        <div className="easy-status" title={sensors.map((s) => `${s.label}: ${s.availability}`).join(' · ')}>
          <span className="easy-dot" style={{ background: READINESS_COLOR[level] }} aria-hidden />
          {readyCount}/{sensors.length} sensors ready
        </div>
        {typeof temperature === 'number' && (
          <div className="easy-temp" title="CPU temperature">
            {temperature.toFixed(1)}°C
          </div>
        )}
        <NotificationCenter />
        <AccountMenu />
        {running ? (
          <button type="button" className="easy-btn" onClick={stop} disabled={stopping}>
            {stopping ? 'Ending…' : 'End mission'}
          </button>
        ) : (
          <Link className="easy-btn primary" to="/mission">
            Start mission
          </Link>
        )}
      </div>
    </header>
  )
}
