import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EventsTable, type EventTableRow } from './EventsTable'

function row(overrides: Partial<EventTableRow> & { id: string }): EventTableRow {
  return {
    timestamp: '2026-08-28T00:00:00Z',
    label: 'Label',
    ...overrides,
  }
}

describe('EventsTable', () => {
  it('renders duplicate-id rows without throwing (regression: the backend can emit duplicate raw-log ids)', () => {
    const rows = [row({ id: 'dup' }), row({ id: 'dup' }), row({ id: 'dup' })]
    render(<EventsTable rows={rows} />)
    expect(screen.getAllByRole('row')).toHaveLength(1 /* header */ + 3)
  })

  it('shows an accurate "N more" count against the real total, not a pre-truncated one', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ id: String(i) }))
    render(<EventsTable rows={rows} maxRows={5} />)
    expect(screen.getByText('25 more (showing 5 most recent)')).toBeInTheDocument()
  })

  it('shows "No events" for an empty list instead of an empty table', () => {
    render(<EventsTable rows={[]} />)
    expect(screen.getByText('No events')).toBeInTheDocument()
  })
})
