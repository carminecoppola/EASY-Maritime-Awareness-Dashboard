import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LiveOverviewPage } from './LiveOverviewPage'
import * as DashboardStateContext from '../hooks/DashboardStateContext'

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

describe('LiveOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state when data is loading', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: true,
      error: null,
    } as any)

    render(<LiveOverviewPage />)
    expect(screen.getByText(/Connecting to backend/)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Network failed'),
    } as any)

    render(<LiveOverviewPage />)
    expect(screen.getByText(/Unable to reach the backend/)).toBeInTheDocument()
  })

  it('renders page title when data is available', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: {} as any,
      loading: false,
      error: null,
    } as any)

    render(<LiveOverviewPage />)
    expect(screen.getByText('Live Overview')).toBeInTheDocument()
  })

  it('renders status summary section', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: {} as any,
      loading: false,
      error: null,
    } as any)

    render(<LiveOverviewPage />)
    expect(screen.getByText('Status Summary')).toBeInTheDocument()
  })

  it('renders live feeds section', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: {} as any,
      loading: false,
      error: null,
    } as any)

    render(<LiveOverviewPage />)
    expect(screen.getByText(/Live Feeds/)).toBeInTheDocument()
  })

  it('renders inference performance section', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: {} as any,
      loading: false,
      error: null,
    } as any)

    render(<LiveOverviewPage />)
    expect(screen.getByText(/Inference Performance/)).toBeInTheDocument()
  })
})
