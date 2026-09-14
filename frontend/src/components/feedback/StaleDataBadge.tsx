import { formatStaleAge } from '../../lib/errors'

interface StaleDataBadgeProps {
  /** Istante dell'ultimo aggiornamento riuscito. */
  lastSuccessfulAt: Date | number | null | undefined
  /** Sovrapposto a un'immagine invece che in linea. */
  overlay?: boolean
  label?: string
}

/**
 * Dichiara che il dato mostrato non è più live. Serve a impedire che un
 * frame vecchio venga letto come appena acquisito.
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
