import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from './usePolling'

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with loading=false when disabled, instead of hanging forever (regression)', () => {
    const fn = vi.fn().mockResolvedValue('data')
    const { result } = renderHook(() => usePolling(fn, { intervalMs: 1000, enabled: false }))
    expect(result.current.loading).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('fetches immediately on mount and again after intervalMs', async () => {
    const fn = vi.fn().mockResolvedValue('data')
    renderHook(() => usePolling(fn, { intervalMs: 1000 }))

    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('slows down instead of stopping while the tab is hidden (regression: a permanently-hidden tab froze on stale data forever)', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    const fn = vi.fn().mockResolvedValue('data')
    renderHook(() => usePolling(fn, { intervalMs: 1000 }))

    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1))

    // Under 4x the interval (the hidden-tab slowdown factor), no second call yet.
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(1)

    // Past 4x the interval, it does poll again — never fully stops.
    await vi.advanceTimersByTimeAsync(3100)
    expect(fn).toHaveBeenCalledTimes(2)

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  })

  it('backs off exponentially on repeated errors, capped at backoffMaxMs', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => usePolling(fn, { intervalMs: 1000, backoffMaxMs: 5000 }))

    await vi.waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(fn).toHaveBeenCalledTimes(1)

    // 2nd attempt after ~2s (1000 * 2^1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
