/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Voluntary sign-in page inside the normal shell.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginForm } from '../components/auth/LoginForm'
import { authErrorMessage, useAuth } from '../hooks/AuthContext'

/**
 * Login reachable voluntarily (inside the normal shell) when enforcement is off,
 * e.g. an operator who wants their actions attributed in the audit log, or an
 * Admin who needs to reach Users & Roles. When enforcement is on it is not needed:
 * LoginGatePage replaces the whole app before this route can even be reached.
 */
export function SignInPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.user && !auth.legacy) {
      navigate('/', { replace: true })
    }
  }, [auth.user, auth.legacy, navigate])

  const handleSubmit = async (username: string, password: string) => {
    try {
      await auth.login(username, password)
      navigate('/', { replace: true })
    } catch (e) {
      throw new Error(authErrorMessage(e))
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-6)' }}>
      <div className="easy-authcard" style={{ maxWidth: 360 }}>
        <div className="easy-authbrand">
          <h1 style={{ fontSize: 16 }}>Sign in</h1>
          <div className="easy-authdevice">
            <b>{auth.hostname ?? 'this device'}</b>
          </div>
        </div>
        <LoginForm onSubmit={handleSubmit} autoFocus />
      </div>
    </div>
  )
}
