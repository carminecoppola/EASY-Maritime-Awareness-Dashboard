/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Full-screen login shown instead of the application when enforcement is on and nobody is signed in.
 */

import { LoginForm } from '../components/auth/LoginForm'
import { authErrorMessage, useAuth } from '../hooks/AuthContext'

/**
 * Replaces the whole app (no sidebar, no data) when enforcement is on and no
 * identity is known: no sensitive operational information is shown before sign-in.
 */
export function LoginGatePage() {
  const auth = useAuth()

  const handleSubmit = async (username: string, password: string) => {
    try {
      await auth.login(username, password)
    } catch (e) {
      throw new Error(authErrorMessage(e))
    }
  }

  return (
    <div className="easy-authscreen">
      <div className="easy-authcard" style={{ maxWidth: 360 }}>
        <div className="easy-authbrand">
          <div className="easy-authbrand-mark" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="9" cy="9" r="1.6" fill="currentColor" />
              <path d="M9 1v2.4M9 14.6V17M17 9h-2.4M3.4 9H1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <h1>EASY</h1>
          <div className="easy-authdevice">
            Signing in to <b>{auth.hostname ?? 'this device'}</b>
          </div>
          <span className="easy-authreach">
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-ok)', display: 'inline-block' }} />
            Device reachable
          </span>
        </div>

        <LoginForm onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
