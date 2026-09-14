import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TechnicalDetails } from './TechnicalDetails'
import type { OperatorError, Severity } from '../../lib/errors'

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
  /** Azione primaria di ripristino, quando esiste davvero. */
  onRetry?: () => void
  retryLabel?: string
  retrying?: boolean
  actionTo?: string
  actionLabel?: string
  technicalDetail?: string
}

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
  // role=alert solo per ciò che blocca: un avviso informativo che ruba
  // l'annuncio a ogni polling renderebbe inutilizzabile uno screen reader.
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

/** Rende un OperatorError già normalizzato. */
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
