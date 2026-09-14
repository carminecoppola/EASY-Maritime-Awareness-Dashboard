import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SnapshotsPage } from './SnapshotsPage'
import * as SnapshotsRecent from '../hooks/useSnapshotsRecent'
import * as DashboardStateContext from '../hooks/DashboardStateContext'

vi.mock('../hooks/useSnapshotsRecent', () => ({
  useSnapshotsRecent: vi.fn(),
}))

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

vi.mock('../api/client', () => ({
  api: { takeSnapshot: vi.fn(), captureAcquisitionSet: vi.fn(), validateDataset: vi.fn(), exportDataset: vi.fn() },
}))

const ITEMS = [
  { filename: 'a_rgb_left.jpg', feed: 'rgb_left', feed_label: 'RGB Left', url: '/snapshots/rgb_left/a.jpg', created_ts: 1789306335 },
  { filename: 'b_rgb_right.jpg', feed: 'rgb_right', feed_label: 'RGB Right', url: '/snapshots/rgb_right/b.jpg', created_ts: 1789306336 },
  { filename: 'c_thermal.jpg', feed: 'thermal', feed_label: 'Thermal', url: '/snapshots/thermal/c.jpg', created_ts: 1789306337 },
]

function mockSnapshots(data: unknown, loading = false, error: unknown = null) {
  vi.mocked(SnapshotsRecent.useSnapshotsRecent).mockReturnValue({ data, loading, error } as any)
}

function mockDashboard(data: unknown = {}) {
  vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
    data,
    loading: false,
    error: null,
  } as any)
}

describe('SnapshotsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', () => {
    mockSnapshots({ items: [], feeds: {} })
    mockDashboard()
    render(<SnapshotsPage />)
    expect(screen.getByRole('heading', { name: /Archive & Snapshots/ })).toBeInTheDocument()
  })

  it('counts RGB and thermal captures from the real items', () => {
    mockSnapshots({ items: ITEMS, feeds: {} })
    mockDashboard()
    render(<SnapshotsPage />)
    expect(screen.getByText('RGB images')).toBeInTheDocument()
    expect(screen.getByText('Left 1 · Right 1')).toBeInTheDocument()
  })

  it('blocks the synchronized capture without an active mission', () => {
    mockSnapshots({ items: [], feeds: {} })
    mockDashboard({ session: { running: false } })
    render(<SnapshotsPage />)
    expect(screen.getByRole('button', { name: 'Capture synchronized set' })).toBeDisabled()
  })

  it('allows the synchronized capture during a mission', () => {
    mockSnapshots({ items: [], feeds: {} })
    mockDashboard({ session: { running: true } })
    render(<SnapshotsPage />)
    expect(screen.getByRole('button', { name: 'Capture synchronized set' })).toBeEnabled()
  })

  it('shows the gallery error state', () => {
    mockSnapshots(null, false, new Error('boom'))
    mockDashboard()
    render(<SnapshotsPage />)
    expect(screen.getByText(/Failed to load snapshots/)).toBeInTheDocument()
  })

  it('shows an empty gallery state', () => {
    mockSnapshots({ items: [], feeds: {} })
    mockDashboard()
    render(<SnapshotsPage />)
    expect(screen.getByText('No snapshot saved yet.')).toBeInTheDocument()
  })
})
