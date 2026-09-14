import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  it('disables submit until both fields have a value', () => {
    render(<LoginForm onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('calls onSubmit with the trimmed username', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<LoginForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: '  alice  ' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('alice', 'secret123'))
  })

  it('shows the error message from a failed submit and does not clear the fields', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Invalid username or password'))
    render(<LoginForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid username or password'))
    expect(screen.getByLabelText('Username')).toHaveValue('alice')
  })

  it('warns when Caps Lock is on while typing the password', () => {
    render(<LoginForm onSubmit={vi.fn()} />)
    const password = screen.getByLabelText('Password')
    const event = new KeyboardEvent('keydown', { key: 'CapsLock', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'getModifierState', { value: () => true })
    fireEvent(password, event)
    expect(screen.getByText(/Caps Lock is on/)).toBeInTheDocument()
  })

  it('does not submit while a previous submit is still in flight', async () => {
    let resolveSubmit: () => void = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        }),
    )
    render(<LoginForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.click(screen.getByRole('button', { name: /Signing in/ }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    resolveSubmit()
  })
})
