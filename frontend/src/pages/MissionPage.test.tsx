import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MissionPage } from './MissionPage'
import * as DashboardStateContext from '../hooks/DashboardStateContext'
import * as SessionListHook from '../hooks/useSessionList'
import * as ApiClient from '../api/client'

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

vi.mock('../hooks/useSessionList', () => ({
  useSessionList: vi.fn(),
}))

vi.mock('../api/client', () => ({
  api: {
    getSessionManifest: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    captureAcquisitionSet: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <MissionPage />
    </MemoryRouter>,
  )
}

function mockDashboard(data: unknown, error: unknown = null) {
  vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
    data,
    loading: false,
    error,
  } as any)
}

function mockSessionList(overrides: Partial<ReturnType<typeof SessionListHook.useSessionList>> = {}) {
  vi.mocked(SessionListHook.useSessionList).mockReturnValue({
    sessions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  } as any)
}

const RUNNING_STATE = {
  session: { running: true, current: { session_id: 'sess-7', start_time: new Date().toISOString() } },
  acquisition: { manifest_counts: { synchronized_samples: 4, detections: 9, snapshots: 12 } },
}

describe('MissionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({} as any)
  })

  it('renders the page title', () => {
    mockDashboard({})
    mockSessionList()
    renderPage()
    expect(screen.getByRole('heading', { name: 'Mission Control' })).toBeInTheDocument()
  })

  it('shows the configuration form when no mission is running', () => {
    mockDashboard({ session: { running: false, current: null } })
    mockSessionList()
    renderPage()
    expect(screen.getByText('Configure mission')).toBeInTheDocument()
    expect(screen.getByLabelText('Operator')).toBeInTheDocument()
  })

  it('renders the preflight checklist', () => {
    mockDashboard({})
    mockSessionList()
    renderPage()
    expect(screen.getByText('Preflight checklist')).toBeInTheDocument()
    expect(screen.getByText('RGB feeds current')).toBeInTheDocument()
    expect(screen.getByText('System temperature')).toBeInTheDocument()
  })

  it('reports unknown instead of inventing storage and temperature', () => {
    mockDashboard({ health: { runtime_state: {} } })
    mockSessionList()
    renderPage()
    expect(screen.getAllByText('Disk usage not reported').length).toBeGreaterThan(0)
    expect(screen.getByText('CPU temperature not reported')).toBeInTheDocument()
  })

  it('does not claim a failure before the first payload arrives', () => {
    mockDashboard(null)
    mockSessionList()
    renderPage()
    expect(screen.getByText('Checks incomplete')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start mission' })).toBeDisabled()
  })

  it('blocks the start button when a check is failing', () => {
    mockDashboard({ health: { runtime_state: {} } })
    mockSessionList()
    renderPage()
    expect(screen.getByRole('button', { name: 'Start mission' })).toBeDisabled()
  })

  it('shows the active mission panel with real manifest counters', () => {
    mockDashboard(RUNNING_STATE)
    mockSessionList()
    renderPage()
    expect(screen.getByText('sess-7')).toBeInTheDocument()
    expect(screen.getByText('Capture sets')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End mission' })).toBeInTheDocument()
    expect(screen.queryByText('Configure mission')).not.toBeInTheDocument()
  })

  it('renders the mission history and its empty state', () => {
    mockDashboard({})
    mockSessionList()
    renderPage()
    expect(screen.getByText('Recent missions')).toBeInTheDocument()
    expect(screen.getByText('No missions recorded yet.')).toBeInTheDocument()
  })

  it('handles session list errors gracefully', () => {
    mockDashboard({})
    mockSessionList({ error: new Error('Load failed') })
    renderPage()
    expect(screen.getByText(/Failed to load session history/)).toBeInTheDocument()
  })
})
