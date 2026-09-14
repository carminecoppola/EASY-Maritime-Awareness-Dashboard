import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LiveOverviewPage } from './LiveOverviewPage'
import * as DashboardStateContext from '../hooks/DashboardStateContext'

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <LiveOverviewPage />
    </MemoryRouter>,
  )
}

function mockState(value: { data: unknown; loading: boolean; error: unknown }) {
  vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue(value as any)
}

describe('LiveOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state when data is loading', () => {
    mockState({ data: null, loading: true, error: null })
    renderPage()
    expect(screen.getByText(/Connecting to backend/)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    mockState({ data: null, loading: false, error: new Error('Network failed') })
    renderPage()
    expect(screen.getByText(/Unable to reach the backend/)).toBeInTheDocument()
  })

  it('renders page title when data is available', () => {
    mockState({ data: {}, loading: false, error: null })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Live Operations' })).toBeInTheDocument()
  })

  it('renders the readiness strip', () => {
    mockState({ data: {}, loading: false, error: null })
    renderPage()
    expect(screen.getByText('System readiness')).toBeInTheDocument()
    expect(screen.getByText('Storage')).toBeInTheDocument()
  })

  it('renders live feeds section', () => {
    mockState({ data: {}, loading: false, error: null })
    renderPage()
    expect(screen.getByText('Live RGB feeds')).toBeInTheDocument()
  })

  it('reports unavailable storage instead of inventing a value', () => {
    mockState({ data: {}, loading: false, error: null })
    renderPage()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })

  it('keeps showing the last known state when the connection drops', () => {
    mockState({ data: { timestamp: new Date().toISOString() }, loading: false, error: new Error('aborted') })
    renderPage()
    expect(screen.getByText(/Connection lost/)).toBeInTheDocument()
  })

  it('does not render the mission bar when no session is running', () => {
    mockState({ data: { session: { running: false } }, loading: false, error: null })
    renderPage()
    expect(screen.queryByText('MISSION ACTIVE')).not.toBeInTheDocument()
  })

  it('renders the mission bar with the real session id when a mission runs', () => {
    mockState({
      data: { session: { running: true, current: { session_id: 'sess-42', start_time: new Date().toISOString() } } },
      loading: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText('MISSION ACTIVE')).toBeInTheDocument()
    expect(screen.getAllByText(/sess-42/).length).toBeGreaterThan(0)
  })
})
