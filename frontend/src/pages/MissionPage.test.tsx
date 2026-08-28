import { render, screen } from '@testing-library/react'
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
  },
}))

vi.mock('../components/mission/SessionStartForm', () => ({
  SessionStartForm: () => <div>Session Start Form</div>,
}))

vi.mock('../components/mission/SessionHistoryTable', () => ({
  SessionHistoryTable: () => <div>Session History Table</div>,
}))

describe('MissionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders mission title', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: {} as any,
      loading: false,
      error: null,
    } as any)

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({} as any)

    render(<MissionPage />)
    expect(screen.getByText('Mission')).toBeInTheDocument()
  })

  it('renders session start form', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: {} as any,
      loading: false,
      error: null,
    } as any)

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({} as any)

    render(<MissionPage />)
    expect(screen.getByText('Session Start Form')).toBeInTheDocument()
  })

  it('renders session history table', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: {} as any,
      loading: false,
      error: null,
    } as any)

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({} as any)

    render(<MissionPage />)
    expect(screen.getByText('Session History Table')).toBeInTheDocument()
  })

  it('handles session list errors gracefully', () => {
    vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
      data: {} as any,
      loading: false,
      error: null,
    } as any)

    vi.mocked(SessionListHook.useSessionList).mockReturnValue({
      sessions: [],
      loading: false,
      error: new Error('Load failed'),
      refresh: vi.fn(),
    })

    vi.mocked(ApiClient.api.getSessionManifest).mockResolvedValue({} as any)

    render(<MissionPage />)
    expect(screen.getByText(/Failed to load session history/)).toBeInTheDocument()
  })
})
