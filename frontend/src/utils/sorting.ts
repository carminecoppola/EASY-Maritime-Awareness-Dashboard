/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Sorting helpers for log-like tables.
 */

/**
 * Most recent rows first, regardless of the order returned by the backend. It
 * does not truncate: the caller applies its own display limit and computes
 * "N more" from the real total (truncating here skewed that count, e.g. "15
 * more" out of 200 instead of "195 more").
 *
 * On equal timestamps (the backend logs several events in the same second) the
 * original order, which is ascending by insertion, must be reversed explicitly:
 * Array.sort is stable, so without the tie-break on the original index ties
 * would keep insertion order and show the oldest of the group instead of the
 * most recent.
 */
export function mostRecentFirst<T extends { timestamp: string }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byTime = new Date(b.row.timestamp).getTime() - new Date(a.row.timestamp).getTime()
      return byTime !== 0 ? byTime : b.index - a.index
    })
    .map(({ row }) => row)
}
