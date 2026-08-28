import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ThermalEventsPage } from './ThermalEventsPage'
import * as ThermalHook from '../hooks/useThermal'
import * as PollingHook from '../hooks/usePolling'

vi.mock('../hooks/useThermal', () => ({
  useThermalStatus: vi.fn(),
}))

vi.mock('../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}))

vi.mock('../components/thermal/ThermalStatusPanel', () => ({
  ThermalStatusPanel: () => <div>Thermal Status Panel</div>,
}))

vi.mock('../components/thermal/ThermalFrameViewer', () => ({
  ThermalFrameViewer: () => <div>Thermal Frame Viewer</div>,
}))

vi.mock('../components/thermal/ThermalSnapshotAction', () => ({
  ThermalSnapshotAction: () => <div>Thermal Snapshot Action</div>,
}))

vi.mock('../components/thermal/DetectionHistory', () => ({
  DetectionHistory: () => <div>Detection History</div>,
}))

describe('ThermalEventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page title', () => {
    vi.mocked(ThermalHook.useThermalStatus).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    render(<ThermalEventsPage />)
    expect(screen.getByText('Thermal & Events')).toBeInTheDocument()
  })

  it('renders all sections', () => {
    vi.mocked(ThermalHook.useThermalStatus).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    render(<ThermalEventsPage />)
    expect(screen.getByText(/Thermal Camera Status/)).toBeInTheDocument()
    expect(screen.getByText(/Live Thermal Frame/)).toBeInTheDocument()
    expect(screen.getByText(/Snapshot Capture/)).toBeInTheDocument()
    expect(screen.getByText(/Detection History/)).toBeInTheDocument()
  })

  it('renders thermal status panel', () => {
    vi.mocked(ThermalHook.useThermalStatus).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    render(<ThermalEventsPage />)
    expect(screen.getByText('Thermal Status Panel')).toBeInTheDocument()
  })

  it('renders detection history component', () => {
    vi.mocked(ThermalHook.useThermalStatus).mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    vi.mocked(PollingHook.usePolling).mockReturnValue({
      data: { detections: [] } as any,
      loading: false,
      error: null,
    })

    render(<ThermalEventsPage />)
    expect(screen.getByText('Detection History')).toBeInTheDocument()
  })
})
