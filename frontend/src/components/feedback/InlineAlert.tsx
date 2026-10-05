/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Inline alert with an optional retry button, link and collapsible technical detail.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TechnicalDetails } from './TechnicalDetails'
import type { OperatorError, Severity } from '../../lib/errors'

/** Glyph shown for each severity. */
const GLYPH: Record<Severity, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  critical: '×',
  neutral: '·',
}

interface InlineAlertProps {
  severity: Severity
  title: string
  children?: ReactNode
  /** Primary recovery action, when one really exists. */
  onRetry?: () => void
  retryLabel?: string
  retrying?: boolean
  actionTo?: string
  actionLabel?: string
  technicalDetail?: string
}

/** Severity-coloured message with title, body and recovery actions. */
export function InlineAlert({
  severity,
  title,
  children,
  onRetry,
  retryLabel = 'Retry',
  retrying = false,
  actionTo,
  actionLabel,
  technicalDetail,
}: InlineAlertProps) {
  // role=alert only for what blocks: an informative notice that grabs the
  // announcement on every poll would make a screen reader unusable.
  const role = severity === 'critical' ? 'alert' : 'status'
  return (
    <div className={`easy-alert ${severity}`} role={role}>
      <span aria-hidden style={{ fontWeight: 800 }}>
        {GLYPH[severity]}
      </span>
      <div style={{ minWidth: 0 }}>
        <b>{title}</b>
        {children && <p>{children}</p>}
        {technicalDetail && <TechnicalDetails detail={technicalDetail} />}
      </div>
      {(onRetry || actionTo) && (
        <div className="easy-alertactions">
          {onRetry && (
            <button type="button" className="easy-btn mini" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Retrying…' : retryLabel}
            </button>
          )}
          {actionTo && actionLabel && (
            <Link className="easy-btn mini" to={actionTo}>
              {actionLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/** Renders an already normalised OperatorError. */
export function OperatorErrorAlert({
  error,
  onRetry,
  retrying,
}: {
  error: OperatorError
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <InlineAlert
      severity={error.severity}
      title={error.title}
      onRetry={error.retryable ? onRetry : undefined}
      retrying={retrying}
      actionTo={error.action?.to}
      actionLabel={error.action?.label}
      technicalDetail={error.technicalDetail}
    >
      {error.message}
    </InlineAlert>
  )
}
