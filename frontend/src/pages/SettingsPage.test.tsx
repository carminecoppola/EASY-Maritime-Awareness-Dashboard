import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SettingsPage } from './SettingsPage'
import * as apiClient from '../api/client'
import * as apiConfig from '../api/config'

vi.mock('../api/client', () => ({
  api: {
    getConfig: vi.fn(),
  },
}))

vi.mock('../api/config', () => ({
  getAuthToken: vi.fn(),
  setAuthToken: vi.fn(),
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders settings title', async () => {
    vi.mocked(apiConfig.getAuthToken).mockReturnValue(null)
    vi.mocked(apiClient.api.getConfig).mockResolvedValue({ auth_required: false } as any)

    render(<SettingsPage />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders shared access token section', async () => {
    vi.mocked(apiConfig.getAuthToken).mockReturnValue(null)
    vi.mocked(apiClient.api.getConfig).mockResolvedValue({ auth_required: false } as any)

    render(<SettingsPage />)
    expect(screen.getByText('Shared access token')).toBeInTheDocument()
  })

  it('shows NOT REQUIRED badge when auth is not required', async () => {
    vi.mocked(apiConfig.getAuthToken).mockReturnValue(null)
    vi.mocked(apiClient.api.getConfig).mockResolvedValue({ auth_required: false } as any)

    render(<SettingsPage />)
    expect(await screen.findByText('NOT REQUIRED')).toBeInTheDocument()
  })

  it('shows REQUIRED BY BACKEND badge when auth is required', async () => {
    vi.mocked(apiConfig.getAuthToken).mockReturnValue(null)
    vi.mocked(apiClient.api.getConfig).mockResolvedValue({ auth_required: true } as any)

    render(<SettingsPage />)
    expect(await screen.findByText('REQUIRED BY BACKEND')).toBeInTheDocument()
  })

  it('disables save button when input is empty', async () => {
    vi.mocked(apiConfig.getAuthToken).mockReturnValue(null)
    vi.mocked(apiClient.api.getConfig).mockResolvedValue({ auth_required: false } as any)

    render(<SettingsPage />)
    const saveButton = screen.getByRole('button', { name: /Save/i })
    expect(saveButton).toBeDisabled()
  })

  it('enables save button when token is entered', async () => {
    vi.mocked(apiConfig.getAuthToken).mockReturnValue(null)
    vi.mocked(apiClient.api.getConfig).mockResolvedValue({ auth_required: false } as any)

    render(<SettingsPage />)
    const input = screen.getByPlaceholderText('Paste the shared token')
    const user = userEvent.setup()
    await user.type(input, 'test-token')

    const saveButton = screen.getByRole('button', { name: /Save/i })
    expect(saveButton).not.toBeDisabled()
  })
})
