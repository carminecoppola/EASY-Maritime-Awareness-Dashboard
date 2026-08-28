import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatRelativeTime, formatTimestampWithRelative } from './formatTime'

describe('formatTime utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatRelativeTime', () => {
    it('should return "just now" for recent timestamps (< 60 seconds)', () => {
      const now = new Date()
      const ago30s = new Date(now.getTime() - 30 * 1000)
      expect(formatRelativeTime(ago30s)).toBe('just now')
    })

    it('should format minutes correctly', () => {
      const now = new Date()
      const ago5m = new Date(now.getTime() - 5 * 60 * 1000)
      expect(formatRelativeTime(ago5m)).toBe('5m ago')
    })

    it('should format 1 minute correctly', () => {
      const now = new Date()
      const ago1m = new Date(now.getTime() - 1 * 60 * 1000)
      expect(formatRelativeTime(ago1m)).toBe('1m ago')
    })

    it('should format hours correctly', () => {
      const now = new Date()
      const ago2h = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      expect(formatRelativeTime(ago2h)).toBe('2h ago')
    })

    it('should format 1 hour correctly', () => {
      const now = new Date()
      const ago1h = new Date(now.getTime() - 1 * 60 * 60 * 1000)
      expect(formatRelativeTime(ago1h)).toBe('1h ago')
    })

    it('should format days correctly', () => {
      const now = new Date()
      const ago3d = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      expect(formatRelativeTime(ago3d)).toBe('3d ago')
    })

    it('should handle ISO string timestamps', () => {
      const now = new Date()
      const ago2h = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      expect(formatRelativeTime(ago2h.toISOString())).toBe('2h ago')
    })

    it('should handle numeric millisecond timestamps', () => {
      const now = Date.now()
      const ago2h = now - 2 * 60 * 60 * 1000
      expect(formatRelativeTime(ago2h)).toBe('2h ago')
    })

    it('should handle numeric second timestamps', () => {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const ago2hSeconds = nowSeconds - 2 * 60 * 60
      expect(formatRelativeTime(ago2hSeconds)).toBe('2h ago')
    })

    it('should return date string for old timestamps (>7 days)', () => {
      const now = new Date()
      const ago10d = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      const result = formatRelativeTime(ago10d)
      // Should be a date string, not relative time
      expect(result).not.toContain('ago')
      expect(result).toMatch(/^\d+\/\d+\/\d+/) // Basic date format check
    })

    it('should return "invalid date" for invalid timestamps', () => {
      expect(formatRelativeTime('invalid')).toBe('invalid date')
      expect(formatRelativeTime('2024-13-45T25:00:00Z')).toBe('invalid date')
    })
  })

  describe('formatTimestampWithRelative', () => {
    it('should include both time and relative components', () => {
      const now = new Date()
      const ago2h = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      const result = formatTimestampWithRelative(ago2h)
      expect(result).toContain('2h ago')
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it('should have format: HH:MM:SS (Xh ago)', () => {
      const now = new Date()
      const ago1h = new Date(now.getTime() - 1 * 60 * 60 * 1000)
      const result = formatTimestampWithRelative(ago1h)
      expect(result).toMatch(/\d{2}:\d{2}:\d{2} \(1h ago\)/)
    })
  })
})
