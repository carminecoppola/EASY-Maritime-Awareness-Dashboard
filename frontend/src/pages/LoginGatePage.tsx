import { LoginForm } from '../components/auth/LoginForm'
import { authErrorMessage, useAuth } from '../hooks/AuthContext'

/**
 * Sostituisce l'intera app (niente sidebar, niente dati) quando
 * l'enforcement è attivo e nessuna identità è nota: "Non mostrerei
 * informazioni operative sensibili prima dell'accesso."
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
