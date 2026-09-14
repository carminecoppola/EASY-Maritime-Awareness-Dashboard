import { useId, useState } from 'react'
import { authErrorMessage, useAuth } from '../../hooks/AuthContext'

const MIN_PASSWORD_LENGTH = 8

/**
 * Crea il primo Admin. Non blocca l'app (l'enforcement resta spento finché
 * l'Admin non lo attiva esplicitamente altrove in questa pagina) — è
 * un'azione che un operatore interessato trova qui, non un muro imposto a
 * chi aggiorna un dispositivo già in uso.
 */
export function FirstRunSetup({ onDone }: { onDone?: () => void }) {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [allowAnonymousViewer, setAllowAnonymousViewer] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usernameId = useId()
  const passwordId = useId()
  const confirmId = useId()
  const anonId = useId()

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit = username.trim().length > 0 && password.length >= MIN_PASSWORD_LENGTH && confirm === password

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit || loading) return
    setLoading(true)
    setError(null)
    try {
      await auth.setup({ username: username.trim(), password, allow_anonymous_viewer: allowAnonymousViewer })
      onDone?.()
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="easy-surface" style={{ maxWidth: 480 }}>
      <div className="easy-panelhead">
        <h2>Set up authentication</h2>
        <span className="easy-panelnote">One-time — creates the first Admin</span>
      </div>
      <form onSubmit={handleSubmit} className="easy-controls">
        <p className="easy-sub" style={{ marginTop: 0 }}>
          This creates the device's first Admin account. Authentication stays optional — nothing is required to sign
          in until an Admin turns it on below or from Users &amp; Roles.
        </p>

        <div className="easy-authfield">
          <label htmlFor={usernameId}>Admin username</label>
          <input
            id={usernameId}
            className="easy-input"
            type="text"
            autoComplete="username"
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          {passwordTooShort && <p className="easy-hint">At least {MIN_PASSWORD_LENGTH} characters.</p>}
        </div>
        <div className="easy-authfield">
          <label htmlFor={confirmId}>Confirm password</label>
          <input
            id={confirmId}
            className="easy-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
          {mismatch && <p className="easy-hint">Passwords don't match.</p>}
        </div>

        <label
          htmlFor={anonId}
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}
        >
          <input
            id={anonId}
            type="checkbox"
            checked={allowAnonymousViewer}
            onChange={(e) => setAllowAnonymousViewer(e.target.checked)}
            disabled={loading}
          />
          Allow anonymous read-only (Viewer) access once authentication is turned on
        </label>

        {error && <p className="easy-error">{error}</p>}

        <button type="submit" className="easy-btn primary" disabled={!canSubmit || loading}>
          {loading ? 'Creating…' : 'Create Admin account'}
        </button>
      </form>
    </article>
  )
}
