import { ApiError } from '../api/client'

export type Severity = 'info' | 'success' | 'warning' | 'critical' | 'neutral'

export interface OperatorAction {
  label: string
  /** Rotta interna verso cui indirizzare l'operatore. */
  to?: string
}

/**
 * Errore tradotto in termini operativi: cosa è fallito, cosa resta
 * disponibile, quale azione è sicura. Il dettaglio tecnico resta separato e
 * non viene mai mostrato come messaggio principale.
 */
export interface OperatorError {
  severity: Severity
  title: string
  message: string
  component?: string
  code?: string | number
  retryable: boolean
  action?: OperatorAction
  technicalDetail?: string
  firstSeenAt: string
  lastSeenAt: string
}

const DIAGNOSTICS: OperatorAction = { label: 'Open Diagnostics', to: '/system-diagnostics' }
const SETTINGS: OperatorAction = { label: 'Open Settings', to: '/settings' }

function bodyMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const value = (body as { error?: unknown }).error
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' : (error as { name?: string })?.name === 'AbortError'
}

/**
 * Traduce qualunque errore di rete/API nella forma che l'interfaccia mostra.
 * Gli status con un significato operativo preciso (401, 409, 429…) hanno un
 * messaggio dedicato: un generico "Errore" non dice all'operatore cosa fare.
 */
export function normalizeApiError(error: unknown, component?: string): OperatorError {
  const now = new Date().toISOString()
  const base = { component, firstSeenAt: now, lastSeenAt: now }

  if (isAbort(error)) {
    return {
      ...base,
      severity: 'warning',
      title: 'Request timed out',
      message: 'The device did not answer in time. The previous state is still shown.',
      retryable: true,
      technicalDetail: 'The request was aborted by the client timeout.',
    }
  }

  if (error instanceof ApiError) {
    const detail = bodyMessage(error.body)
    const technicalDetail = `HTTP ${error.status}${detail ? ` — ${detail}` : ''}`
    const common = { ...base, code: error.status, technicalDetail }

    if (error.status === 400 || error.status === 422) {
      return {
        ...common,
        severity: 'warning',
        title: 'The device rejected the request',
        message: detail ?? 'Check the submitted values and try again.',
        retryable: false,
      }
    }
    if (error.status === 401 || error.status === 403) {
      return {
        ...common,
        severity: 'critical',
        title: 'Shared token required or invalid',
        message: 'This device requires a shared token for actions that change state.',
        retryable: false,
        action: SETTINGS,
      }
    }
    if (error.status === 404) {
      return {
        ...common,
        severity: 'warning',
        title: 'Resource no longer available',
        message: detail ?? 'The requested item no longer exists on the device.',
        retryable: true,
      }
    }
    if (error.status === 409) {
      return {
        ...common,
        severity: 'warning',
        title: 'Conflicting state',
        message: detail ?? 'The device is in a state that does not allow this action right now.',
        retryable: false,
      }
    }
    if (error.status === 429) {
      return {
        ...common,
        severity: 'warning',
        title: 'Too many requests',
        message: 'Wait before repeating this action.',
        retryable: true,
      }
    }
    if (error.status >= 500) {
      return {
        ...common,
        severity: 'critical',
        title: 'The device reported an internal error',
        message: detail ?? 'The action could not be completed. The previous state is unchanged.',
        retryable: true,
        action: DIAGNOSTICS,
      }
    }
    return {
      ...common,
      severity: 'warning',
      title: 'Unexpected response from device',
      message: detail ?? 'The device answered in a way the dashboard did not expect.',
      retryable: true,
      action: DIAGNOSTICS,
    }
  }

  if (error instanceof SyntaxError) {
    return {
      ...base,
      severity: 'warning',
      title: 'Unexpected response from device',
      message: 'The answer could not be read. The previous state is still shown.',
      retryable: true,
      technicalDetail: error.message,
      action: DIAGNOSTICS,
    }
  }

  return {
    ...base,
    severity: 'critical',
    title: 'Device unreachable',
    message: 'The dashboard could not reach the device over the network.',
    retryable: true,
    action: DIAGNOSTICS,
    technicalDetail: error instanceof Error ? error.message : String(error),
  }
}

/** Età leggibile di un dato non più aggiornato. */
export function formatStaleAge(lastSuccessfulAt: Date | number | null | undefined): string | null {
  if (lastSuccessfulAt === null || lastSuccessfulAt === undefined) return null
  const ms = Date.now() - (lastSuccessfulAt instanceof Date ? lastSuccessfulAt.getTime() : lastSuccessfulAt)
  if (!Number.isFinite(ms) || ms < 0) return null
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s old`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m old`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h old`
  return `${Math.floor(hours / 24)}d old`
}

/** Chiave di deduplica: lo stesso guasto ripetuto a ogni polling è una sola notifica. */
export function dedupeNotificationKey(component: string, code?: string | number): string {
  return `${component}::${code ?? 'none'}`
}
