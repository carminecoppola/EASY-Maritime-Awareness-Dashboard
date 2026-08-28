import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SystemDiagnosticsPage } from './SystemDiagnosticsPage'
import * as SystemStatusHook from '../hooks/useSystemStatus'
import * as DashboardStateContext from '../hooks/DashboardStateContext'
import * as PollingHook from '../hooks/usePolling'

vi.mock('../hooks/useSystemStatus', () => ({
  useSystemStatus: vi.fn(),
}))

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

vi.mock('../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}))

describe('SystemDiagnosticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders system diagnostics title', () => {
    vi.mocked(SystemStatusHook.useSystemStatus).mockReturnValue({
      data: { hostname: 'test' } as any,
      loading: false,
      error: null,
    })

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    } as any)

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    render(<SystemDiagnosticsPage />)
    expect(screen.getByText('System Diagnostics')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    vi.mocked(SystemStatusHook.useSystemStatus).mockReturnValue({
      data: null,
      loading: true,
      error: null,
    })

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    } as any)

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    render(<SystemDiagnosticsPage />)
    expect(screen.getByText(/Loading system diagnostics/)).toBeInTheDocument()
  })

  it('shows error state', () => {
    vi.mocked(SystemStatusHook.useSystemStatus).mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Failed'),
    })

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    } as any)

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    render(<SystemDiagnosticsPage />)
    expect(screen.getByText(/Failed to load diagnostics/)).toBeInTheDocument()
  })

  it('renders system information section', () => {
    vi.mocked(SystemStatusHook.useSystemStatus).mockReturnValue({
      data: { hostname: 'test-host', model: 'Raspberry Pi 4' } as any,
      loading: false,
      error: null,
    })

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    } as any)

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    render(<SystemDiagnosticsPage />)
    expect(screen.getByText('System Information')).toBeInTheDocument()
  })
})
