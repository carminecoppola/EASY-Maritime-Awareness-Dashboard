import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HelpPage } from './HelpPage'
import * as DashboardStateContext from '../hooks/DashboardStateContext'

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

function renderPage(data: unknown = {}) {
  vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
    data,
    loading: false,
    error: null,
  } as any)
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  )
}

describe('HelpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Help & Onboarding/ })).toBeInTheDocument()
  })

  it('renders the four workflow steps', () => {
    renderPage()
    expect(screen.getByText('Verify Live')).toBeInTheDocument()
    expect(screen.getByText('Start Mission')).toBeInTheDocument()
    expect(screen.getByText('Capture & Analyze')).toBeInTheDocument()
    expect(screen.getByText('Review & Export')).toBeInTheDocument()
  })

  it('renders the page guide with working client-side links', () => {
    renderPage()
    expect(screen.getByText('Why start a mission?').closest('a')).toHaveAttribute('href', '/mission')
    expect(screen.getByText('What should I expect from AI?').closest('a')).toHaveAttribute('href', '/analysis')
  })

  it('shows troubleshooting entries', () => {
    renderPage()
    expect(screen.getByText('Feed is offline?')).toBeInTheDocument()
    expect(screen.getByText('High resource usage?')).toBeInTheDocument()
  })

  it('drives the readiness checklist from real state, not a fixed list', () => {
    renderPage({
      health: {
        runtime_state: { rgb: { availability: 'STREAMING' }, thermal: { availability: 'READY' } },
        system: { disk: { free_gb: 30, percent: 40, total_gb: 50, used_gb: 20 }, cpu_temperature_c: 55 },
      },
      session: { running: false },
    })
    expect(screen.getByText(/Storage capacity/)).toBeInTheDocument()
    expect(screen.getByText(/No mission is active/)).toBeInTheDocument()
  })

  it('reports an active mission when one is running', () => {
    renderPage({ session: { running: true } })
    expect(screen.getByText(/A mission is active/)).toBeInTheDocument()
  })
})
