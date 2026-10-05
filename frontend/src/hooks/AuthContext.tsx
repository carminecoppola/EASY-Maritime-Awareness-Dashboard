/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Authentication state for the whole application.
 *
 * `AuthProvider` asks the backend who the visitor is and whether role enforcement
 * is on, keeps the CSRF token in memory, and exposes `login`, `logout` and
 * `setup`. `useAuth` reads it; `roleAtLeast` mirrors the backend rank check.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import { setCsrfToken } from '../api/config'
import type { AuthRole, AuthUser } from '../api/types'

/** What is known about the visitor and the server's authentication mode. */
interface AuthState {
  status: 'loading' | 'ready'
  setupComplete: boolean
  enforcementEnabled: boolean
  enforcementForcedByServer: boolean | null
  anonymousViewerEnabled: boolean
  user: AuthUser | null
  /** The identity comes from the legacy shared token, not from a real login. */
  legacy: boolean
  hostname: string | null
}

/** The state plus the actions that change it. */
interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setup: (payload: { username: string; password: string; allow_anonymous_viewer?: boolean }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const INITIAL_STATE: AuthState = {
  status: 'loading',
  setupComplete: false,
  enforcementEnabled: false,
  enforcementForcedByServer: null,
  anonymousViewerEnabled: false,
  user: null,
  legacy: false,
  hostname: null,
}

/** Loads the authentication state once and keeps it up to date after login, logout and setup. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE)

  const refresh = useCallback(async () => {
    try {
      const [status, session] = await Promise.all([api.getAuthStatus(), api.getAuthSession()])
      setCsrfToken(session.csrf_token ?? null)
      setState({
        status: 'ready',
        setupComplete: status.setup_complete,
        enforcementEnabled: status.enforcement_enabled,
        enforcementForcedByServer: status.enforcement_forced_by_server,
        anonymousViewerEnabled: status.anonymous_viewer_enabled,
        user: session.user,
        legacy: Boolean(session.legacy),
        hostname: status.hostname,
      })
    } catch {
      // The backend is unreachable, so it is unknown whether authentication is
      // required. Assume it is not rather than blocking the whole app behind a
      // login screen that may not be needed; the dashboard polling reports
      // "backend unreachable" separately.
      setState({ ...INITIAL_STATE, status: 'ready' })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.authLogin({ username, password })
    setCsrfToken(result.csrf_token)
    setState((prev) => ({ ...prev, user: result.user, legacy: false }))
  }, [])

  const setup = useCallback(
    async (payload: { username: string; password: string; allow_anonymous_viewer?: boolean }) => {
      const result = await api.authSetup(payload)
      setCsrfToken(result.csrf_token)
      setState((prev) => ({
        ...prev,
        setupComplete: true,
        user: result.user,
        legacy: false,
        anonymousViewerEnabled: Boolean(payload.allow_anonymous_viewer),
      }))
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await api.authLogout()
    } finally {
      setCsrfToken(null)
      setState((prev) => ({ ...prev, user: null, legacy: false }))
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, refresh, login, logout, setup }),
    [state, refresh, login, logout, setup],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Read the authentication context (must be used inside `AuthProvider`). */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

const ROLE_RANK: Record<AuthRole, number> = { viewer: 0, operator: 1, admin: 2 }

/** Same comparison as the backend (easy_dashboard/auth.py role_at_least). */
export function roleAtLeast(role: AuthRole | null | undefined, minimum: AuthRole): boolean {
  if (!role) return false
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

/** Turns an API error into a readable message for a login or setup form. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: string } | null
    if (body?.error) return body.error
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
