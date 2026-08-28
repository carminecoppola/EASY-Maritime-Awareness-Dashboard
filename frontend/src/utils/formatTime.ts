/**
 * Format a timestamp as a relative time string (e.g., "2h ago", "just now")
 * Handles both ISO strings and numeric timestamps
 */
export function formatRelativeTime(timestamp: string | number | Date): string {
  let date: Date

  if (typeof timestamp === 'string') {
    date = new Date(timestamp)
  } else if (typeof timestamp === 'number') {
    // Assume milliseconds if > 10^11, seconds otherwise
    date = new Date(timestamp > 10 ** 11 ? timestamp : timestamp * 1000)
  } else {
    date = timestamp
  }

  if (isNaN(date.getTime())) {
    return 'invalid date'
  }

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 0) {
    return 'just now' // Future timestamp
  }
  if (diffSecs < 60) {
    return 'just now'
  }
  if (diffMins < 60) {
    return diffMins === 1 ? '1m ago' : `${diffMins}m ago`
  }
  if (diffHours < 24) {
    return diffHours === 1 ? '1h ago' : `${diffHours}h ago`
  }
  if (diffDays < 7) {
    return diffDays === 1 ? '1d ago' : `${diffDays}d ago`
  }

  // Fall back to short date for older timestamps
  return date.toLocaleDateString()
}

/**
 * Format a timestamp with both exact time and relative time
 * Returns a compound string like "14:32:45 (2h ago)"
 */
export function formatTimestampWithRelative(timestamp: string | number | Date): string {
  let date: Date

  if (typeof timestamp === 'string') {
    date = new Date(timestamp)
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp > 10 ** 11 ? timestamp : timestamp * 1000)
  } else {
    date = timestamp
  }

  if (isNaN(date.getTime())) {
    return 'invalid date'
  }

  const timeStr = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const relStr = formatRelativeTime(date)

  return `${timeStr} (${relStr})`
}
