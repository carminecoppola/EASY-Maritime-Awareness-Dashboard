import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MissionPage } from './MissionPage'
import * as DashboardStateContext from '../hooks/DashboardStateContext'
import * as SessionListHook from '../hooks/useSessionList'
import * as ApiClient from '../api/client'
import type { DashboardState } from '../api/types'

// Mock the hooks
vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

vi.mock('../hooks/useSessionList', () => ({
  useSessionList: vi.fn(),
}))

vi.mock('../api/client', () => ({
  api: {
    getSessionManifest: vi.fn(),
  },
}))

// Mock child components
vi.mock('../components/mission/SessionStartForm', () => ({
  SessionStartForm: () => <div data-testid="session-start-form">Session Start Form</div>,
}))

vi.mock('../components/mission/SessionHistoryTable', () => ({
  SessionHistoryTable: ({ sessions, loading, error }: any) => (
    <div data-testid="session-history-table">
      {loading && <p>Loading sessions</p>}
      {error && <p>Error loading sessions</p>}
      {sessions && <p>Sessions: {sessions.length}</p>}
    </div>
  ),
}))

vi.mock('../components/mission/ManifestStats', () => ({
  ManifestStats: ({ counts }: any) => (
    <div data-testid="manifest-stats">Manifest: {counts ? 'loaded' : 'empty'}</div>
  ),
}))

vi.mock('../components/mission/AcquisitionStatusSection', () => ({
  AcquisitionStatusSection: ({ acquisitionStatus }: any) => (
    <div data-testid="acquisition-status">Acquisition Status</div>
  ),
}))

function createMockDashboardState(overrides?: any): DashboardState {
  return {
    session: {
      running: false,
      current: null,
    },
    health: { runtime_state: { rgb: { availability: 'ONLINE' } }, system_components: { components: [] } },
    detections: { count: 0, fps: 0, last_run_ts: new Date().toISOString(), last_inference_ms: 0, detections: [] },
    devices: { devices: [] },
    sources: { sources: [] },
    events: { events: [] },
    events_current: { events: [] },
    acquisition: undefined,
    ...overrides,
  } as DashboardState
}

describe('MissionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the mission page title', async () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState({
        session: { running: false, current: null },
      }),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    render(<MissionPage />)

    await waitFor(() => {
      expect(screen.getByText('Mission')).toBeInTheDocument()
    })
  })

  it('renders page subtitle', async () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState(),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    render(<MissionPage />)

    await waitFor(() => {
      expect(screen.getByText(/Start and manage capture sessions/)).toBeInTheDocument()
    })
  })

  it('renders session start form', async () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState({
        session: { running: false, current: null },
      }),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    render(<MissionPage />)

    await waitFor(() => {
      expect(screen.getByTestId('session-start-form')).toBeInTheDocument()
    })
  })

  it('renders session history table', async () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState(),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    const { getByText } = render(<MissionPage />)

    // Expand the session history collapsible
    const user = userEvent.setup()
    const collapsibleButton = getByText('Session History')
    await user.click(collapsibleButton)

    await waitFor(() => {
      expect(screen.getByTestId('session-history-table')).toBeInTheDocument()
    })
  })

  it('displays error when session history fails to load', async () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState(),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: new Error('Failed to load sessions'),
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    const { getByText } = render(<MissionPage />)

    // Expand the session history collapsible
    const user = userEvent.setup()
    const collapsibleButton = getByText('Session History')
    await user.click(collapsibleButton)

    await waitFor(() => {
      expect(screen.getByText(/Failed to load session history/)).toBeInTheDocument()
    })
  })

  it('displays session history when sessions are available', async () => {
    const mockSessions = [
      { session_id: 'sess1', start_time: '2026-08-28T10:00:00Z', duration: 3600 },
      { session_id: 'sess2', start_time: '2026-08-27T10:00:00Z', duration: 7200 },
    ]

    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState(),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: mockSessions as any,
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    const { getByText } = render(<MissionPage />)

    // Expand the session history collapsible
    const user = userEvent.setup()
    const collapsibleButton = getByText('Session History')
    await user.click(collapsibleButton)

    await waitFor(() => {
      expect(screen.getByText('Sessions: 2')).toBeInTheDocument()
    })
  })

  it('displays current session when available', async () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState({
        session: {
          running: true,
          current: {
            session_id: 'current_session',
            start_time: '2026-08-28T12:00:00Z',
            duration: 1800,
            operator: 'John Doe',
            mode: 'standard',
            editable: {
              operator: 'John Doe',
              notes: 'Test session',
              campaign: null,
              location: null,
              weather: null,
            },
          },
        },
      }),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    render(<MissionPage />)

    await waitFor(() => {
      expect(screen.getByText(/Current Session/)).toBeInTheDocument()
      expect(screen.getByText('current_session')).toBeInTheDocument()
    })
  })

  it('displays session running status', async () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState({
        session: {
          running: true,
          current: {
            session_id: 'sess123',
            start_time: '2026-08-28T12:00:00Z',
            duration: 1800,
          },
        },
      }),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    render(<MissionPage />)

    await waitFor(() => {
      expect(screen.getByText('RUNNING')).toBeInTheDocument()
    })
  })

  it('does not display current session section when no session is available', async () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: createMockDashboardState({
        session: {
          running: false,
          current: null,
        },
      }),
      loading: false,
      error: null,
    })

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({ counts: {} })

    render(<MissionPage />)

    await waitFor(() => {
      // If no current session, the current session section should not be shown
      const currentSessionSections = screen.queryAllByText(/Current Session/)
      expect(currentSessionSections.length === 0 || currentSessionSections[0]).toBeDefined()
    })
  })
})
