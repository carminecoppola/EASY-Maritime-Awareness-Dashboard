import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { UsersRolesPage } from './UsersRolesPage'
import { StepUpProvider } from '../components/feedback/StepUpProvider'
import { useAuth } from '../hooks/AuthContext'
import { api, ApiError } from '../api/client'

// A differenza di UsersRolesPage.test.tsx (che mocka useStepUp), qui si
// verifica il flusso reale: azione bloccata -> dialogo -> password corretta
// -> l'azione originale viene ritentata e completata.

vi.mock('../hooks/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../hooks/AuthContext')>('../hooks/AuthContext')
  return { ...actual, useAuth: vi.fn() }
})

vi.mock('../api/client', () => ({
  api: {
    listAuthUsers: vi.fn(),
    createAuthUser: vi.fn(),
    updateAuthUser: vi.fn(),
    deactivateAuthUser: vi.fn(),
    updateAuthSettings: vi.fn(),
    authStepUp: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number
    body: unknown
    constructor(status: number, body: unknown, message: string) {
      super(message)
      this.status = status
      this.body = body
    }
  },
}))

function mockAuth() {
  vi.mocked(useAuth).mockReturnValue({
    status: 'ready',
    setupComplete: true,
    enforcementEnabled: true,
    enforcementForcedByServer: null,
    anonymousViewerEnabled: false,
    user: { id: 'admin1', username: 'admin1', role: 'admin', active: true, created_at: '', updated_at: '' },
    legacy: false,
    hostname: 'raspberrypi',
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    setup: vi.fn(),
  } as any)
}

describe('UsersRolesPage + StepUpProvider integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    vi.mocked(api.listAuthUsers).mockResolvedValue({
      ok: true,
      users: [
        { id: 'admin1', username: 'admin1', role: 'admin', active: true, created_at: '', updated_at: '' },
        { id: 'viewer1', username: 'viewer1', role: 'viewer', active: true, created_at: '', updated_at: '' },
      ],
    } as any)
  })

  it('prompts for a password before deactivating a user, then completes the action', async () => {
    vi.mocked(api.deactivateAuthUser).mockRejectedValueOnce(
      new ApiError(403, { ok: false, code: 'step_up_required', error: 'Re-enter your password' }, 'HTTP 403'),
    )
    vi.mocked(api.authStepUp).mockResolvedValue({ ok: true, elevated_until: 0 } as any)
    vi.mocked(api.deactivateAuthUser).mockResolvedValueOnce({
      ok: true,
      user: { id: 'viewer1', username: 'viewer1', role: 'viewer', active: false, created_at: '', updated_at: '' },
    } as any)

    render(
      <StepUpProvider>
        <UsersRolesPage />
      </StepUpProvider>,
    )

    await waitFor(() => expect(screen.getByText('viewer1')).toBeInTheDocument())
    const row = screen.getByText('viewer1').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'adminpass123' } })
    fireEvent.click(screen.getByText('Confirm'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.deactivateAuthUser).toHaveBeenCalledTimes(2)
    expect(api.authStepUp).toHaveBeenCalledWith({ password: 'adminpass123' })
  })
})
