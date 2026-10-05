/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Plain login form (username, password, Caps Lock hint, error alert).
 */

import { useId, useRef, useState, type KeyboardEvent } from 'react'

/** `onSubmit` should throw on failure; its message is shown to the user. */
interface LoginFormProps {
  onSubmit: (username: string, password: string) => Promise<void>
  submitLabel?: string
  autoFocus?: boolean
}

/**
 * Plain login form with no frame and no logo: the user of the component adds
 * those (LoginGatePage full screen, SignInPage inside the shell).
 */
export function LoginForm({ onSubmit, submitLabel = 'Sign in', autoFocus = true }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [capsLock, setCapsLock] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const usernameId = useId()
  const passwordId = useId()
  const cardRef = useRef<HTMLFormElement>(null)

  const handlePasswordKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === 'function') {
      setCapsLock(event.getModifierState('CapsLock'))
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || !username.trim() || !password) return
    setLoading(true)
    setError(null)
    try {
      await onSubmit(username.trim(), password)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign in failed'
      setError(message)
      // A single horizontal shake on wrong credentials, never a repeated flash,
      // and disabled with prefers-reduced-motion via CSS.
      setShake(true)
      setTimeout(() => setShake(false), 260)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form ref={cardRef} onSubmit={handleSubmit} className={shake ? 'shake' : undefined} noValidate>
      <div className="easy-authfield">
        <label htmlFor={usernameId}>Username</label>
        <input
          id={usernameId}
          className="easy-input"
          type="text"
          autoComplete="username"
          autoFocus={autoFocus}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="easy-authfield">
        <label htmlFor={passwordId}>Password</label>
        <input
          id={passwordId}
          className="easy-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyUp={handlePasswordKey}
          onKeyDown={handlePasswordKey}
          disabled={loading}
        />
        {capsLock && (
          <p className="easy-authcapslock" role="status">
            <span aria-hidden>⇪</span> Caps Lock is on
          </p>
        )}
      </div>

      {error && (
        <div className="easy-alert critical" role="alert" style={{ marginBottom: 'var(--space-3)' }}>
          <span aria-hidden style={{ fontWeight: 800 }}>
            ×
          </span>
          <div>
            <b>Sign in failed</b>
            <p>{error}</p>
          </div>
        </div>
      )}

      <button type="submit" className="easy-btn primary easy-authsubmit" disabled={loading || !username.trim() || !password}>
        {loading ? 'Signing in…' : submitLabel}
      </button>
    </form>
  )
}
