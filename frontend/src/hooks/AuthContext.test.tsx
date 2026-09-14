import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AuthProvider, roleAtLeast, useAuth } from './AuthContext'
import { api } from '../api/client'
import { getCsrfToken } from '../api/config'

vi.mock('../api/client', () => ({
  api: {
    getAuthStatus: vi.fn(),
    getAuthSession: vi.fn(),
    authLogin: vi.fn(),
    authLogout: vi.fn(),
    authSetup: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 0
    body: unknown = null
  },
}))

const OPEN_STATUS = {
  ok: true,
  setup_complete: false,
  enforcement_enabled: false,
  auth_enforced_setting: false,
  enforcement_forced_by_server: null,
  anonymous_viewer_enabled: false,
  hostname: 'raspberrypi',
}

const NO_SESSION = { ok: true, user: null }

function Consumer() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="user">{auth.user?.username ?? 'none'}</span>
      <span data-testid="enforcement">{String(auth.enforcementEnabled)}</span>
    </div>
  )
}

describe('roleAtLeast', () => {
  it('ranks admin above operator above viewer', () => {
    expect(roleAtLeast('admin', 'viewer')).toBe(true)
    expect(roleAtLeast('operator', 'viewer')).toBe(true)
    expect(roleAtLeast('viewer', 'operator')).toBe(false)
    expect(roleAtLeast('admin', 'admin')).toBe(true)
  })

  it('treats a missing role as never satisfying anything', () => {
    expect(roleAtLeast(null, 'viewer')).toBe(false)
    expect(roleAtLeast(undefined, 'viewer')).toBe(false)
  })
})

describe('useAuth outside a provider', () => {
  it('throws instead of silently returning a fake identity', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Consumer />)).toThrow(/AuthProvider/)
    errorSpy.mockRestore()
  })
})

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts loading, then reflects the fetched status and session', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue(OPEN_STATUS as any)
    vi.mocked(api.getAuthSession).mockResolvedValue(NO_SESSION as any)

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'))
    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(screen.getByTestId('enforcement').textContent).toBe('false')
  })

  it('falls back to an open, ready state when the backend is unreachable', async () => {
    vi.mocked(api.getAuthStatus).mockRejectedValue(new Error('network down'))
    vi.mocked(api.getAuthSession).mockRejectedValue(new Error('network down'))

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'))
    // Non presume che l'auth sia richiesta solo perché non si è potuto
    // verificarlo — altrimenti un blip di rete mostrerebbe un login inutile.
    expect(screen.getByTestId('enforcement').textContent).toBe('false')
  })

  it('login stores the csrf token and exposes the signed-in user', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({ ...OPEN_STATUS, enforcement_enabled: true } as any)
    vi.mocked(api.getAuthSession).mockResolvedValue(NO_SESSION as any)
    vi.mocked(api.authLogin).mockResolvedValue({
      ok: true,
      user: { id: 'u1', username: 'alice', role: 'operator', active: true, created_at: '', updated_at: '' },
      csrf_token: 'tok-123',
    } as any)

    function LoginConsumer() {
      const auth = useAuth()
      return (
        <div>
          <span data-testid="user">{auth.user?.username ?? 'none'}</span>
          <button onClick={() => auth.login('alice', 'password123')}>go</button>
        </div>
      )
    }

    render(
      <AuthProvider>
        <LoginConsumer />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'))
    await act(async () => {
      screen.getByText('go').click()
    })

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('alice'))
    expect(getCsrfToken()).toBe('tok-123')
  })

  it('logout clears the user and the csrf token even if the request fails', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue(OPEN_STATUS as any)
    vi.mocked(api.getAuthSession).mockResolvedValue({
      ok: true,
      user: { id: 'u1', username: 'bob', role: 'viewer', active: true, created_at: '', updated_at: '' },
      csrf_token: 'tok-456',
    } as any)
    vi.mocked(api.authLogout).mockRejectedValue(new Error('boom'))

    function LogoutConsumer() {
      const auth = useAuth()
      return (
        <div>
          <span data-testid="user">{auth.user?.username ?? 'none'}</span>
          <button onClick={() => auth.logout().catch(() => {})}>out</button>
        </div>
      )
    }

    render(
      <AuthProvider>
        <LogoutConsumer />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('bob'))
    await act(async () => {
      screen.getByText('out').click()
    })
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('none'))
    expect(getCsrfToken()).toBeNull()
  })
})
