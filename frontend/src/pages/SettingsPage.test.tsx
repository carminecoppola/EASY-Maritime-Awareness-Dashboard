import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SettingsPage } from './SettingsPage'
import * as ApiClient from '../api/client'
import * as DashboardStateContext from '../hooks/DashboardStateContext'

vi.mock('../api/client', () => ({
  api: { getConfig: vi.fn() },
}))

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

function renderPage(data: unknown = {}, error: unknown = null) {
  vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
    data,
    loading: false,
    error,
  } as any)
  return render(<SettingsPage />)
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.removeItem('easy.confirmEndMission')
    vi.mocked(ApiClient.api.getConfig).mockResolvedValue({ auth_required: false } as any)
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('shows the token field with an associated label', () => {
    renderPage()
    expect(screen.getByLabelText('Shared token')).toBeInTheDocument()
  })

  it('shows OPEN ACCESS when the backend does not require a token', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('OPEN ACCESS')).toBeInTheDocument())
  })

  it('shows TOKEN REQUIRED when the backend requires one', async () => {
    vi.mocked(ApiClient.api.getConfig).mockResolvedValue({ auth_required: true } as any)
    renderPage()
    await waitFor(() => expect(screen.getByText('TOKEN REQUIRED')).toBeInTheDocument())
  })

  it('does not present an unreadable config as open access', async () => {
    vi.mocked(ApiClient.api.getConfig).mockRejectedValue(new Error('offline'))
    renderPage()
    await waitFor(() => expect(screen.getByText('ACCESS CONFIGURATION UNAVAILABLE')).toBeInTheDocument())
    expect(screen.queryByText('OPEN ACCESS')).not.toBeInTheDocument()
  })

  it('disables save until a token is typed', () => {
    renderPage()
    const save = screen.getByRole('button', { name: 'Save token' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Shared token'), { target: { value: 'abc' } })
    expect(save).toBeEnabled()
  })

  it('persists the session-safety preference', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Session safety' }))
    const toggle = screen.getByRole('switch', { name: /Confirm before ending a mission/ })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(localStorage.getItem('easy.confirmEndMission')).toBe('false')
  })

  it('shows the real device identity and reports missing values', () => {
    renderPage({ health: { system: { hostname: 'raspberrypi', ip_address: '192.168.1.54' } } })
    fireEvent.click(screen.getByRole('tab', { name: 'About this device' }))
    expect(screen.getByText('raspberrypi')).toBeInTheDocument()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
  })
})
