import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FirstRunSetup } from './FirstRunSetup'
import { useAuth } from '../../hooks/AuthContext'

vi.mock('../../hooks/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/AuthContext')>('../../hooks/AuthContext')
  return { ...actual, useAuth: vi.fn() }
})

function mockAuth(setup: ReturnType<typeof vi.fn>) {
  vi.mocked(useAuth).mockReturnValue({
    status: 'ready',
    setupComplete: false,
    enforcementEnabled: false,
    enforcementForcedByServer: null,
    anonymousViewerEnabled: false,
    user: null,
    legacy: false,
    hostname: 'raspberrypi',
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    setup,
  } as any)
}

describe('FirstRunSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps submit disabled until the password meets the minimum length and matches', () => {
    mockAuth(vi.fn())
    render(<FirstRunSetup />)
    const submit = screen.getByRole('button', { name: 'Create Admin account' })
    fireEvent.change(screen.getByLabelText('Admin username'), { target: { value: 'admin' } })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'short' } })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/At least 8 characters/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different1' } })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/don't match/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough1' } })
    expect(submit).toBeEnabled()
  })

  it('submits the anonymous-viewer preference alongside the credentials', async () => {
    const setup = vi.fn().mockResolvedValue(undefined)
    mockAuth(setup)
    render(<FirstRunSetup />)
    fireEvent.change(screen.getByLabelText('Admin username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByLabelText(/Allow anonymous/))
    fireEvent.click(screen.getByRole('button', { name: 'Create Admin account' }))

    await waitFor(() =>
      expect(setup).toHaveBeenCalledWith({ username: 'admin', password: 'longenough1', allow_anonymous_viewer: true }),
    )
  })

  it('shows a server error without crashing', async () => {
    const setup = vi.fn().mockRejectedValue(new Error('Username already exists'))
    mockAuth(setup)
    render(<FirstRunSetup />)
    fireEvent.change(screen.getByLabelText('Admin username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Admin account' }))

    await waitFor(() => expect(screen.getByText('Username already exists')).toBeInTheDocument())
  })
})
