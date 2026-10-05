/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Root component: authentication gate around the application shell.
 *
 * When enforcement is on and nobody is signed in, only the login page is
 * rendered and no operational data (or polling) starts before access.
 */

import { RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/AuthContext'
import { DashboardStateProvider } from './hooks/DashboardStateContext'
import { ToastProvider } from './components/feedback/ToastProvider'
import { StepUpProvider } from './components/feedback/StepUpProvider'
import { LoginGatePage } from './pages/LoginGatePage'
import { router } from './routes'

/** Renders the login page, nothing (while loading) or the full application with its providers. */
function Gate() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    // Deliberately silent: a flash of state must not compete with the real
    // page splash that follows as soon as the answer is known.
    return null
  }

  // Only here the shell stays fully unmounted: enforcement is on and no identity
  // is known, so no operational data may appear before sign-in. In every other
  // case (enforcement off, or on with a valid identity) the normal app starts,
  // including the shared polling.
  if (auth.enforcementEnabled && !auth.user) {
    return <LoginGatePage />
  }

  return (
    <DashboardStateProvider>
      <ToastProvider>
        <StepUpProvider>
          <RouterProvider router={router} />
        </StepUpProvider>
      </ToastProvider>
    </DashboardStateProvider>
  )
}

/** Wraps the gate in the authentication provider. */
function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

export default App
