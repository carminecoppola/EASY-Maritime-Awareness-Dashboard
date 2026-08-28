import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SnapshotsPage } from './SnapshotsPage'
import * as SnapshotsRecent from '../hooks/useSnapshotsRecent'

vi.mock('../hooks/useSnapshotsRecent', () => ({
  useSnapshotsRecent: vi.fn(),
}))

describe('SnapshotsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders snapshots title', () => {
    vi.mocked(SnapshotsRecent.useSnapshotsRecent).mockReturnValue({
      data: { items: [], feeds: {} } as any,
      loading: false,
      error: null,
    })

    render(<SnapshotsPage />)
    expect(screen.getByText('Snapshots')).toBeInTheDocument()
  })

  it('renders manual capture section', () => {
    vi.mocked(SnapshotsRecent.useSnapshotsRecent).mockReturnValue({
      data: { items: [], feeds: {} } as any,
      loading: false,
      error: null,
    })

    render(<SnapshotsPage />)
    expect(screen.getByText(/Manual Capture/)).toBeInTheDocument()
  })

  it('renders snapshot gallery section', () => {
    vi.mocked(SnapshotsRecent.useSnapshotsRecent).mockReturnValue({
      data: { items: [], feeds: {} } as any,
      loading: false,
      error: null,
    })

    render(<SnapshotsPage />)
    expect(screen.getByText(/Snapshot Gallery/)).toBeInTheDocument()
  })

  it('renders dataset export section', () => {
    vi.mocked(SnapshotsRecent.useSnapshotsRecent).mockReturnValue({
      data: { items: [], feeds: {} } as any,
      loading: false,
      error: null,
    })

    render(<SnapshotsPage />)
    expect(screen.getAllByText(/Dataset Export/)).toBeTruthy()
  })

  it('displays error when snapshots fail to load', () => {
    vi.mocked(SnapshotsRecent.useSnapshotsRecent).mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Failed to fetch'),
    })

    render(<SnapshotsPage />)
    expect(screen.getByText(/Failed to load snapshots/)).toBeInTheDocument()
  })
})
