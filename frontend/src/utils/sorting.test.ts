import { describe, expect, it } from 'vitest'
import { mostRecentFirst } from './sorting'

describe('mostRecentFirst', () => {
  it('orders ascending-timestamp input newest-first (regression: Activity Log showed 25-day-old events)', () => {
    const rows = [
      { id: 'a', timestamp: '2026-07-01T00:00:00Z' },
      { id: 'b', timestamp: '2026-07-15T00:00:00Z' },
      { id: 'c', timestamp: '2026-08-01T00:00:00Z' },
    ]
    expect(mostRecentFirst(rows).map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('breaks timestamp ties by original insertion order, newest-inserted first', () => {
    const rows = [
      { id: 'first-inserted', timestamp: '2026-08-01T00:00:00Z' },
      { id: 'second-inserted', timestamp: '2026-08-01T00:00:00Z' },
      { id: 'third-inserted', timestamp: '2026-08-01T00:00:00Z' },
    ]
    expect(mostRecentFirst(rows).map((r) => r.id)).toEqual([
      'third-inserted',
      'second-inserted',
      'first-inserted',
    ])
  })

  it('does not truncate — callers rely on the full sorted list to compute an accurate "N more" count', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    }))
    expect(mostRecentFirst(rows)).toHaveLength(200)
  })

  it('does not mutate the input array', () => {
    const rows = [
      { id: 'a', timestamp: '2026-07-01T00:00:00Z' },
      { id: 'b', timestamp: '2026-08-01T00:00:00Z' },
    ]
    const original = [...rows]
    mostRecentFirst(rows)
    expect(rows).toEqual(original)
  })

  it('handles an empty array', () => {
    expect(mostRecentFirst([])).toEqual([])
  })
})
