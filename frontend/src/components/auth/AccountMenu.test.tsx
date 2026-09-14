import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AccountMenu } from './AccountMenu'
import { useAuth } from '../../hooks/AuthContext'

vi.mock('../../hooks/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/AuthContext')>('../../hooks/AuthContext')
  return { ...actual, useAuth: vi.fn() }
})

function baseAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  return {
    status: 'ready',
    setupComplete: true,
    enforcementEnabled: false,
    enforcementForcedByServer: null,
    anonymousViewerEnabled: false,
    user: null,
    legacy: false,
    hostname: 'raspberrypi',
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    setup: vi.fn(),
    ...overrides,
  } as any
}

function renderMenu() {
  return render(
    <MemoryRouter>
      <AccountMenu />
    </MemoryRouter>,
  )
}

describe('AccountMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a Sign in link when nobody is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue(baseAuth())
    renderMenu()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })

  it('shows the username and role once signed in', () => {
    vi.mocked(useAuth).mockReturnValue(
      baseAuth({ user: { id: 'u1', username: 'lotti', role: 'operator', active: true, created_at: '', updated_at: '' } }),
    )
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /lotti/ }))
    const panel = screen.getByRole('dialog', { name: 'Account' })
    expect(within(panel).getByText('lotti')).toBeInTheDocument()
    expect(within(panel).getByText('operator')).toBeInTheDocument()
  })

  it('offers Users & Roles only to admins', () => {
    vi.mocked(useAuth).mockReturnValue(
      baseAuth({ user: { id: 'u1', username: 'viewerperson', role: 'viewer', active: true, created_at: '', updated_at: '' } }),
    )
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /viewerperson/ }))
    expect(screen.queryByText('Users & Roles')).not.toBeInTheDocument()
  })

  it('calls logout when signing out', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue(
      baseAuth({ user: { id: 'u1', username: 'admin1', role: 'admin', active: true, created_at: '', updated_at: '' }, logout }),
    )
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /admin1/ }))
    fireEvent.click(screen.getByText('Sign out'))
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })
})
