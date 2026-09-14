import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { StepUpProvider, useStepUp } from './StepUpProvider'
import { api, ApiError } from '../../api/client'

vi.mock('../../api/client', () => ({
  api: { authStepUp: vi.fn() },
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

function StepUpRequiredAction({ label = 'run' }: { label?: string }) {
  const { runElevated } = useStepUp()
  const action = vi.fn(async () => {
    throw new ApiError(403, { ok: false, code: 'step_up_required', error: 'Re-enter your password' }, 'HTTP 403')
  })
  return (
    <div>
      <button onClick={() => runElevated(action, 'Confirm this dangerous thing.').catch(() => {})}>{label}</button>
    </div>
  )
}

function renderWithProvider(children: React.ReactNode) {
  return render(<StepUpProvider>{children}</StepUpProvider>)
}

describe('StepUpProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not show the dialog until a step-up is actually requested', () => {
    renderWithProvider(<StepUpRequiredAction />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the dialog with the given reason when an action requires elevation', async () => {
    renderWithProvider(<StepUpRequiredAction />)
    fireEvent.click(screen.getByText('run'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText('Confirm this dangerous thing.')).toBeInTheDocument()
  })

  it('retries the action once after a successful password confirmation', async () => {
    vi.mocked(api.authStepUp).mockResolvedValue({ ok: true, elevated_until: Date.now() / 1000 + 300 } as any)

    function Wrapped() {
      const { runElevated } = useStepUp()
      const attempts = { current: 0 }
      const action = vi.fn(async () => {
        attempts.current += 1
        if (attempts.current === 1) {
          throw new ApiError(403, { ok: false, code: 'step_up_required', error: 'x' }, 'HTTP 403')
        }
        return 'success'
      })
      return <button onClick={() => runElevated(action).then((r) => (document.title = String(r)))}>go</button>
    }

    render(
      <StepUpProvider>
        <Wrapped />
      </StepUpProvider>,
    )
    fireEvent.click(screen.getByText('go'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } })
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(document.title).toBe('success'))
  })

  it('keeps the dialog open and shows the server error on a wrong password', async () => {
    vi.mocked(api.authStepUp).mockRejectedValue(
      new ApiError(401, { ok: false, error: 'Incorrect password' }, 'HTTP 401'),
    )
    renderWithProvider(<StepUpRequiredAction />)
    fireEvent.click(screen.getByText('run'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(screen.getByText('Incorrect password')).toBeInTheDocument())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes without retrying when Cancel is pressed', async () => {
    renderWithProvider(<StepUpRequiredAction />)
    fireEvent.click(screen.getByText('run'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'))
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.authStepUp).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    renderWithProvider(<StepUpRequiredAction />)
    fireEvent.click(screen.getByText('run'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not open the dialog for an ordinary (non step-up) error', async () => {
    function OrdinaryFailure() {
      const { runElevated } = useStepUp()
      const action = vi.fn(async () => {
        throw new ApiError(500, { ok: false, error: 'boom' }, 'HTTP 500')
      })
      return <button onClick={() => runElevated(action).catch(() => {})}>go</button>
    }
    render(
      <StepUpProvider>
        <OrdinaryFailure />
      </StepUpProvider>,
    )
    fireEvent.click(screen.getByText('go'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('useStepUp outside a provider', () => {
  it('throws instead of silently no-oping', () => {
    function Consumer() {
      useStepUp()
      return null
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Consumer />)).toThrow(/StepUpProvider/)
    errorSpy.mockRestore()
  })
})
