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

const baseDiag = {
  hostname: 'test',
  ip_address: '127.0.0.1',
  model: 'Raspberry Pi 4',
  os_release: 'Debian GNU/Linux 11',
  python_version: '3.11.0',
  uptime_seconds: 3600,
  uptime_human: '1h',
  cpu_percent: 10,
  cpu_temperature_c: null,
  ram: { percent: 40, total_mb: 8000, used_mb: 3200, available_mb: 4800 },
  disk: { total_gb: 32, used_gb: 10, free_gb: 22, percent: 31 },
}

describe('SystemDiagnosticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders system diagnostics title', () => {
    vi.mocked(SystemStatusHook.useSystemStatus).mockReturnValue({
      data: baseDiag as any,
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
      data: { ...baseDiag, hostname: 'test-host', model: 'Raspberry Pi 4' } as any,
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
