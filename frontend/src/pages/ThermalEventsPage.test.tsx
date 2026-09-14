import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ThermalEventsPage } from './ThermalEventsPage'
import * as ThermalHook from '../hooks/useThermal'
import * as DashboardStateContext from '../hooks/DashboardStateContext'

vi.mock('../hooks/useThermal', () => ({
  useThermalStatus: vi.fn(),
  useThermalLastFrame: vi.fn(() => ({ url: '/thermal/last-frame?t=1' })),
}))

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

vi.mock('../api/client', () => ({
  api: { takeThermalSnapshot: vi.fn() },
  withCacheBuster: (url: string) => url,
}))

const READY_STATUS = {
  status: 'READY',
  device: '/dev/video0',
  discovery_method: 'v4l2-ctl',
  video_size: '160x120',
  input_format: 'y16',
  hotspot_percent: 0.84,
  signal_spread: 513,
  threshold_celsius: 35,
  delta_threshold: 8,
  cpu_temperature_limit: 78,
  frame_seq: 3,
  last_frame_ts: 1789306335.65,
  anomaly_active: false,
  runtime_state: { availability: 'READY', detected: true, ready: true, streaming: false },
}

function mockThermal(data: unknown, error: unknown = null) {
  vi.mocked(ThermalHook.useThermalStatus).mockReturnValue({ data, loading: false, error } as any)
}

function mockDashboard(data: unknown) {
  vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
    data,
    loading: false,
    error: null,
  } as any)
}

describe('ThermalEventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ThermalHook.useThermalLastFrame).mockReturnValue({ url: '/thermal/last-frame?t=1' } as any)
  })

  it('renders the page title', () => {
    mockThermal(READY_STATUS)
    mockDashboard({})
    render(<ThermalEventsPage />)
    expect(screen.getByRole('heading', { name: /Thermal & Events/ })).toBeInTheDocument()
  })

  it('shows the real sensor telemetry instead of mockup values', () => {
    mockThermal(READY_STATUS)
    mockDashboard({})
    render(<ThermalEventsPage />)
    expect(screen.getByText('/dev/video0 · v4l2-ctl')).toBeInTheDocument()
    expect(screen.getByText('160x120')).toBeInTheDocument()
    expect(screen.getAllByText('0.84%').length).toBeGreaterThan(0)
    expect(screen.getByText('Raw sensor units, not °C')).toBeInTheDocument()
  })

  it('reports an unavailable sensor instead of claiming it is operational', () => {
    mockThermal({ runtime_state: { availability: 'NOT_PRESENT' } })
    mockDashboard({})
    render(<ThermalEventsPage />)
    expect(screen.getAllByText('NOT PRESENT').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Capture thermal snapshot' })).toBeDisabled()
  })

  it('renders the merged event stream and filters it', () => {
    mockThermal(READY_STATUS)
    mockDashboard({
      events: {
        events: [
          { id: 'e1', timestamp: '2026-09-13T15:32:15Z', source: 'thermal', type: 'capture', description: 'Thermal frame saved', severity: 'INFO' },
        ],
      },
      events_current: {
        events: [
          { event_id: 'm1', created_at: '2026-09-13T15:33:00Z', type: 'SHIP_DETECTED', severity: 'MEDIUM', status: 'NEW', source: 'rgb_left' },
        ],
      },
    })
    render(<ThermalEventsPage />)
    expect(screen.getByText('Thermal frame saved')).toBeInTheDocument()
    expect(screen.getByText('SHIP_DETECTED')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Thermal' }))
    expect(screen.getByText('Thermal frame saved')).toBeInTheDocument()
    expect(screen.queryByText('SHIP_DETECTED')).not.toBeInTheDocument()
  })

  it('shows an empty state when no event has been recorded', () => {
    mockThermal(READY_STATUS)
    mockDashboard({})
    render(<ThermalEventsPage />)
    expect(screen.getByText('No events recorded yet.')).toBeInTheDocument()
  })
})
