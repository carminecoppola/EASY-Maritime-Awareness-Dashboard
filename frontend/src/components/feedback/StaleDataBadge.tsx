/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Badge that marks data as no longer live.
 */

import { formatStaleAge } from '../../lib/errors'

interface StaleDataBadgeProps {
  /** Time of the last successful update. */
  lastSuccessfulAt: Date | number | null | undefined
  /** Overlaid on an image instead of inline. */
  overlay?: boolean
  label?: string
}

/**
 * Declares that the data shown is no longer live, so an old frame is never read
 * as freshly acquired.
 */
export function StaleDataBadge({ lastSuccessfulAt, overlay = false, label = 'STALE' }: StaleDataBadgeProps) {
  const age = formatStaleAge(lastSuccessfulAt)
  const title =
    lastSuccessfulAt !== null && lastSuccessfulAt !== undefined
      ? `Last successful update: ${new Date(lastSuccessfulAt).toLocaleString()}`
      : 'No successful update recorded'
  return (
    <span className={`easy-stale${overlay ? ' easy-stale-overlay' : ''}`} title={title}>
      {label}
      {age ? ` · ${age.toUpperCase()}` : ' · NOT LIVE'}
    </span>
  )
}
