/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Banner shown when the dashboard backend stops answering.
 */

import { Link } from 'react-router-dom'
import { useSharedDashboardState } from '../../hooks/DashboardStateContext'
import { formatStaleAge, normalizeApiError } from '../../lib/errors'
import { TechnicalDetails } from './TechnicalDetails'

/**
 * Connection escalation: an isolated failure does not flash, two are a warning,
 * three or more are a persistent outage. The previous data stays visible,
 * declared as stale.
 */
export function GlobalSystemBanner() {
  const { error, failures, lastSuccessAt, refresh, loading } = useSharedDashboardState()

  if (!error || failures < 2) return null

  const critical = failures >= 3
  const operatorError = normalizeApiError(error, 'dashboard-state')
  const age = formatStaleAge(lastSuccessAt)

  return (
    <div className={`easy-banner ${critical ? 'critical' : 'warning'}`} role={critical ? 'alert' : 'status'}>
      <span className="easy-alerticon" aria-hidden>
        !
      </span>
      <div style={{ minWidth: 0 }}>
        <b>{critical ? 'Dashboard backend unreachable' : 'Connection unstable'}</b>
        <p>
          {critical
            ? 'Live updates have stopped. The last known state is shown below and state-changing actions may fail.'
            : 'An update could not be retrieved. The dashboard is retrying automatically.'}
          {age ? ` Last successful update: ${age}.` : ' No successful update recorded yet.'}
          {` ${failures} consecutive failures.`}
        </p>
        {operatorError.technicalDetail && <TechnicalDetails detail={operatorError.technicalDetail} />}
      </div>
      <div className="easy-banneractions">
        <button type="button" className="easy-btn mini" onClick={refresh} disabled={loading}>
          {loading ? 'Retrying…' : 'Retry now'}
        </button>
        <Link className="easy-btn mini" to="/system-diagnostics">
          Open Diagnostics
        </Link>
      </div>
    </div>
  )
}
