import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { dedupeNotificationKey, formatStaleAge, normalizeApiError } from './errors'

describe('normalizeApiError', () => {
  it('turns a 409 into the reason the backend gave', () => {
    const error = new ApiError(409, { ok: false, error: 'Start a mission before capturing' }, 'HTTP 409')
    const result = normalizeApiError(error, 'capture-set')
    expect(result.message).toBe('Start a mission before capturing')
    expect(result.title).toBe('Conflicting state')
    expect(result.retryable).toBe(false)
    expect(result.technicalDetail).toContain('HTTP 409')
  })

  it('routes a 401 to Settings instead of retrying', () => {
    const result = normalizeApiError(new ApiError(401, null, 'HTTP 401'))
    expect(result.severity).toBe('critical')
    expect(result.action?.to).toBe('/settings')
    expect(result.retryable).toBe(false)
  })

  it('treats a 503 as retryable with a diagnostics route', () => {
    const result = normalizeApiError(new ApiError(503, { error: 'thermal unavailable' }, 'HTTP 503'))
    expect(result.severity).toBe('critical')
    expect(result.retryable).toBe(true)
    expect(result.action?.to).toBe('/system-diagnostics')
    expect(result.message).toBe('thermal unavailable')
  })

  it('reports a timeout as a timeout, keeping the previous state', () => {
    const abort = new DOMException('aborted', 'AbortError')
    const result = normalizeApiError(abort)
    expect(result.title).toBe('Request timed out')
    expect(result.severity).toBe('warning')
    expect(result.retryable).toBe(true)
  })

  it('reports an unreachable device for a network failure', () => {
    const result = normalizeApiError(new TypeError('Failed to fetch'))
    expect(result.title).toBe('Device unreachable')
    expect(result.severity).toBe('critical')
  })

  it('never leaks a raw HTTP string as the operator message', () => {
    const result = normalizeApiError(new ApiError(500, null, 'HTTP 500 on /api/x'))
    expect(result.message).not.toContain('HTTP 500')
    expect(result.technicalDetail).toContain('HTTP 500')
  })
})

describe('formatStaleAge', () => {
  it('returns null when nothing has ever succeeded', () => {
    expect(formatStaleAge(null)).toBeNull()
    expect(formatStaleAge(undefined)).toBeNull()
  })

  it('formats seconds, minutes and hours', () => {
    const now = Date.now()
    expect(formatStaleAge(now - 5_000)).toBe('5s old')
    expect(formatStaleAge(now - 120_000)).toBe('2m old')
    expect(formatStaleAge(now - 7_200_000)).toBe('2h old')
  })
})

describe('dedupeNotificationKey', () => {
  it('collapses the same failure from the same component', () => {
    expect(dedupeNotificationKey('capture-set', 409)).toBe(dedupeNotificationKey('capture-set', 409))
    expect(dedupeNotificationKey('capture-set', 409)).not.toBe(dedupeNotificationKey('capture-set', 503))
  })
})
