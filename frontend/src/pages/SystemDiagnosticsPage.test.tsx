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

vi.mock('../hooks/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../hooks/AuthContext')>('../hooks/AuthContext')
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      status: 'ready',
      setupComplete: false,
      enforcementEnabled: false,
      enforcementForcedByServer: null,
      anonymousViewerEnabled: false,
      user: null,
      legacy: false,
      hostname: null,
      refresh: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      setup: vi.fn(),
    })),
  }
})

vi.mock('../components/feedback/StepUpProvider', () => ({
  useStepUp: () => ({ requestStepUp: vi.fn(), runElevated: (action: () => Promise<unknown>) => action() }),
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
      failures: 0,
      lastSuccessAt: Date.now(),
      refresh: vi.fn(),
    } as any)

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    } as any)

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
      failures: 0,
      lastSuccessAt: Date.now(),
      refresh: vi.fn(),
    } as any)

    render(<SystemDiagnosticsPage />)
    expect(screen.getByText('System Diagnostics')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    vi.mocked(SystemStatusHook.useSystemStatus).mockReturnValue({
      data: null,
      loading: true,
      error: null,
      failures: 0,
      lastSuccessAt: Date.now(),
      refresh: vi.fn(),
    } as any)

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    } as any)

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
      failures: 0,
      lastSuccessAt: Date.now(),
      refresh: vi.fn(),
    } as any)

    render(<SystemDiagnosticsPage />)
    expect(screen.getByText(/Loading system diagnostics/)).toBeInTheDocument()
  })

  it('shows error state', () => {
    vi.mocked(SystemStatusHook.useSystemStatus).mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Failed'),
      failures: 0,
      lastSuccessAt: Date.now(),
      refresh: vi.fn(),
    } as any)

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    } as any)

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
      failures: 0,
      lastSuccessAt: Date.now(),
      refresh: vi.fn(),
    } as any)

    render(<SystemDiagnosticsPage />)
    expect(screen.getByText(/The backend could not be reached/)).toBeInTheDocument()
  })

  it('renders system information section', () => {
    vi.mocked(SystemStatusHook.useSystemStatus).mockReturnValue({
      data: { ...baseDiag, hostname: 'test-host', model: 'Raspberry Pi 4' } as any,
      loading: false,
      error: null,
      failures: 0,
      lastSuccessAt: Date.now(),
      refresh: vi.fn(),
    } as any)

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    } as any)

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
      failures: 0,
      lastSuccessAt: Date.now(),
      refresh: vi.fn(),
    } as any)

    render(<SystemDiagnosticsPage />)
    // The identity strip is a compact, unlabeled panel (no "System
    // Information" heading) — assert its actual content instead.
    expect(screen.getByText('test-host')).toBeInTheDocument()
    expect(screen.getByText('Raspberry Pi 4')).toBeInTheDocument()
  })
})
