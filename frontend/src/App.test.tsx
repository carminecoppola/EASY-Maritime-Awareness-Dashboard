import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import App from './App'
import { api } from './api/client'

vi.mock('./api/client', () => ({
  api: {
    getAuthStatus: vi.fn(),
    getAuthSession: vi.fn(),
    authLogin: vi.fn(),
    authLogout: vi.fn(),
    authSetup: vi.fn(),
    getDashboardState: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 0
    body: unknown = null
  },
  withCacheBuster: (url: string) => url,
}))

const BASE_STATUS = {
  ok: true,
  setup_complete: true,
  enforcement_enabled: false,
  auth_enforced_setting: false,
  enforcement_forced_by_server: null,
  anonymous_viewer_enabled: false,
  hostname: 'raspberrypi',
}

describe('App auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getDashboardState).mockResolvedValue({} as any)
  })

  it('renders the dashboard directly when enforcement is off (default rollout)', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue(BASE_STATUS as any)
    vi.mocked(api.getAuthSession).mockResolvedValue({ ok: true, user: null } as any)

    render(<App />)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Live Operations' })).toBeInTheDocument())
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  })

  it('blocks the whole app behind a login screen when enforcement is on and nobody is signed in', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({ ...BASE_STATUS, enforcement_enabled: true } as any)
    vi.mocked(api.getAuthSession).mockResolvedValue({ ok: true, user: null } as any)

    render(<App />)

    await waitFor(() => expect(screen.getByLabelText('Username')).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Live Operations' })).not.toBeInTheDocument()
    expect(screen.getByText(/raspberrypi/)).toBeInTheDocument()
  })

  it('renders the dashboard when enforcement is on and a session is already valid', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({ ...BASE_STATUS, enforcement_enabled: true } as any)
    vi.mocked(api.getAuthSession).mockResolvedValue({
      ok: true,
      user: { id: 'u1', username: 'opuser', role: 'operator', active: true, created_at: '', updated_at: '' },
      csrf_token: 'tok',
    } as any)

    render(<App />)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Live Operations' })).toBeInTheDocument())
  })

  it('does not poll the dashboard while the login gate is showing', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({ ...BASE_STATUS, enforcement_enabled: true } as any)
    vi.mocked(api.getAuthSession).mockResolvedValue({ ok: true, user: null } as any)

    render(<App />)

    await waitFor(() => expect(screen.getByLabelText('Username')).toBeInTheDocument())
    expect(api.getDashboardState).not.toHaveBeenCalled()
  })
})
