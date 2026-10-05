/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Translation of network and API errors into operator-facing messages.
 *
 * The UI never shows a raw exception: `normalizeApiError` maps timeouts, HTTP
 * statuses (400/422, 401/403, 404, 409, 429, 5xx), unreadable answers and network
 * failures to a title, a message, a safe next action and a separate technical detail.
 */

import { ApiError } from '../api/client'

/** How serious a message is; drives its colour and icon. */
export type Severity = 'info' | 'success' | 'warning' | 'critical' | 'neutral'

/** A suggested next step shown as a link or button. */
export interface OperatorAction {
  label: string
  /** Internal route the operator is sent to. */
  to?: string
}

/**
 * An error translated into operational terms: what failed, what is still
 * available, which action is safe. The technical detail stays separate and is
 * never shown as the main message.
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

/** The `error` string of a JSON error body, if any. */
function bodyMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const value = (body as { error?: unknown }).error
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** True for an aborted request (the client timeout). */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' : (error as { name?: string })?.name === 'AbortError'
}

/**
 * Translates any network or API error into the form the interface shows.
 * Statuses with a precise operational meaning (401, 409, 429...) get a dedicated
 * message: a generic "Error" does not tell the operator what to do.
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

/** Readable age of data that is no longer being refreshed (e.g. "3m old"). */
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

/** Deduplication key: the same failure repeated on every poll is a single notification. */
export function dedupeNotificationKey(component: string, code?: string | number): string {
  return `${component}::${code ?? 'none'}`
}
