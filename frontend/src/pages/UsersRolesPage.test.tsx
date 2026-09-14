import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { UsersRolesPage } from './UsersRolesPage'
import { useAuth } from '../hooks/AuthContext'
import { api } from '../api/client'

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
  },
  ApiError: class ApiError extends Error {
    status = 0
    body: unknown = null
  },
}))

vi.mock('../components/feedback/StepUpProvider', () => ({
  useStepUp: () => ({ requestStepUp: vi.fn(), runElevated: (action: () => Promise<unknown>) => action() }),
}))

function baseAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  return {
    status: 'ready',
    setupComplete: true,
    enforcementEnabled: false,
    enforcementForcedByServer: null,
    anonymousViewerEnabled: false,
    user: { id: 'admin1', username: 'admin1', role: 'admin', active: true, created_at: '', updated_at: '' },
    legacy: false,
    hostname: 'raspberrypi',
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    setup: vi.fn(),
    ...overrides,
  } as any
}

describe('UsersRolesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listAuthUsers).mockResolvedValue({
      ok: true,
      users: [
        { id: 'admin1', username: 'admin1', role: 'admin', active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '' },
        { id: 'viewer1', username: 'viewer1', role: 'viewer', active: true, created_at: '2026-01-02T00:00:00Z', updated_at: '' },
      ],
    } as any)
  })

  it('shows first-run setup when no admin exists yet', () => {
    vi.mocked(useAuth).mockReturnValue(baseAuth({ setupComplete: false, user: null }))
    render(<UsersRolesPage />)
    expect(screen.getByText('Set up authentication')).toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
  })

  it('shows access denied for a non-admin, without leaking the user table', () => {
    vi.mocked(useAuth).mockReturnValue(
      baseAuth({ user: { id: 'v1', username: 'plainviewer', role: 'viewer', active: true, created_at: '', updated_at: '' } }),
    )
    render(<UsersRolesPage />)
    expect(screen.getByText('403 — Access not allowed')).toBeInTheDocument()
    expect(screen.queryByText('viewer1')).not.toBeInTheDocument()
  })

  it('lists real users for an admin and marks their own row', async () => {
    vi.mocked(useAuth).mockReturnValue(baseAuth())
    render(<UsersRolesPage />)
    await waitFor(() => expect(screen.getByText('viewer1')).toBeInTheDocument())
    expect(screen.getByText('· you')).toBeInTheDocument()
  })

  it('disables deactivating your own account', async () => {
    vi.mocked(useAuth).mockReturnValue(baseAuth())
    render(<UsersRolesPage />)
    await waitFor(() => expect(screen.getByText('viewer1')).toBeInTheDocument())
    const rows = screen.getAllByRole('row')
    const selfRow = rows.find((row) => row.textContent?.includes('admin1'))!
    expect(within(selfRow).getByRole('button', { name: 'Deactivate' })).toBeDisabled()
  })

  it('shows a disabled Require sign-in toggle when forced by the server', () => {
    vi.mocked(useAuth).mockReturnValue(baseAuth({ enforcementForcedByServer: false }))
    render(<UsersRolesPage />)
    expect(screen.getByRole('switch', { name: 'Require sign-in' })).toBeDisabled()
    expect(screen.getByText(/Forced off by the server/)).toBeInTheDocument()
  })
})
