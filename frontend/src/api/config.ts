// Gestione del token condiviso opzionale (X-EASY-Token). Riproduce lo stesso
// livello di fiducia del meccanismo attuale (chi ha accesso alla pagina ha il
// token): l'operatore lo incolla una volta nelle Impostazioni della SPA e
// viene conservato in localStorage. Non è un vero sistema di login.

const STORAGE_KEY = 'easy.dashboard.token'

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // localStorage non disponibile (es. modalità privata): il token resta
    // solo per la sessione corrente, nessun crash.
  }
}

// Token CSRF della sessione di login — solo in memoria, mai in localStorage:
// vive quanto la scheda del browser, esattamente come il cookie di sessione
// HttpOnly a cui è associato. Un reload lo riottiene da GET /api/auth/session.
let csrfToken: string | null = null

export function getCsrfToken(): string | null {
  return csrfToken
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token
}
