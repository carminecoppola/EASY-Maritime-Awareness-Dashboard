/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Top bar: page title, connection and sensor readiness, CPU temperature, notifications, account and the start/end mission button.
 */

import { Link, useLocation } from 'react-router-dom'
import { useSharedDashboardState } from '../../hooks/DashboardStateContext'
import { useMissionControl } from '../../hooks/useMissionControl'
import { readinessLevel, READINESS_COLOR, sensorReadiness } from '../../lib/readiness'
import { formatRelativeTime } from '../../utils/formatTime'
import { titleForPath } from './navItems'
import { NotificationCenter } from '../feedback/NotificationCenter'
import { AccountMenu } from '../auth/AccountMenu'

/** Colour and text of the connection badge. */
interface Connection {
  color: string
  text: string
}

/** Disconnected on error, Connecting before the first payload, then Operational or Degraded. */
function connectionState(loading: boolean, hasError: boolean, ok: boolean | undefined): Connection {
  if (hasError) return { color: 'var(--accent-critical)', text: 'Disconnected' }
  if (loading && ok === undefined) return { color: 'var(--text-muted)', text: 'Connecting…' }
  if (ok) return { color: 'var(--accent-ok)', text: 'Operational' }
  return { color: 'var(--accent-warn)', text: 'Degraded' }
}

/** Global status strip shown on every page. */
export function TopBar() {
  const { data, error, loading } = useSharedDashboardState()
  const { running, stop, stopping } = useMissionControl()
  const { pathname } = useLocation()

  const connection = connectionState(loading, Boolean(error), data?.ok)
  const sensors = sensorReadiness(data ?? null)
  const readyCount = sensors.filter((s) => s.ready).length
  const level = readinessLevel(sensors)
  const temperature = data?.health?.system?.cpu_temperature_c

  // A connection error does not erase the last received state: the badge states
  // the connection, the title states how old the data is.
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
