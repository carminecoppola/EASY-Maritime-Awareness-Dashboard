/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Client-side storage of the optional shared token and of the session CSRF token.
 *
 * The shared token (`X-EASY-Token`) is pasted once in Settings and kept in
 * `localStorage`; whoever can open the page effectively has it, so it is not a
 * login system. The CSRF token of a login session lives in memory only, exactly as
 * long as the browser tab, like the HttpOnly session cookie it is tied to.
 */

const STORAGE_KEY = 'easy.dashboard.token'

/** Stored shared token, or null. */
export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Store the shared token (null removes it); silently ignores unavailable storage. */
export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // localStorage unavailable (e.g. private mode): the token only lasts for
    // the current session, without crashing.
  }
}

// CSRF token of the login session: memory only, never localStorage. It lives as
// long as the browser tab, like the HttpOnly session cookie it belongs to. A
// reload gets it back from GET /api/auth/session.
let csrfToken: string | null = null

/** CSRF token of the current login session, or null. */
export function getCsrfToken(): string | null {
  return csrfToken
}

/** Keep the CSRF token in memory. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token
}
