import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { getAuthToken, setAuthToken } from '../api/config'
import { StatusBadge } from '../components/status/StatusBadge'

// Gap trovato dalla review di sicurezza: setAuthToken() esisteva già in
// api/config.ts ma non era mai invocata da nessuna UI — se un deployment
// attivava security.shared_token lato backend, la SPA non aveva alcun modo
// per inserire il token e tutte le richieste non-GET avrebbero ricevuto 401.
export function SettingsPage() {
  const [tokenInput, setTokenInput] = useState('')
  const [savedToken, setSavedToken] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState<boolean | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSavedToken(getAuthToken())
    api
      .getConfig()
      .then((cfg) => setAuthRequired(cfg.auth_required))
      .catch(() => setAuthRequired(null))
  }, [])

  const handleSave = () => {
    setAuthToken(tokenInput.trim() || null)
    setSavedToken(getAuthToken())
    setTokenInput('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    setAuthToken(null)
    setSavedToken(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 560 }}>
      <div>
        <h1 style={{ fontSize: 18 }}>Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          Local, per-browser settings — nothing here is sent anywhere except as the request header below.
        </p>
      </div>

      <section
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Shared access token
          </h3>
          {authRequired !== null && (
            <StatusBadge
              tone={
                authRequired
                  ? { color: 'var(--accent-warn)', dim: 'var(--accent-warn-dim)', label: '' }
                  : { color: 'var(--text-muted)', dim: 'var(--bg-3)', label: '' }
              }
              text={authRequired ? 'REQUIRED BY BACKEND' : 'NOT REQUIRED'}
            />
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          This dashboard's default trust model is an open LAN: anyone who can reach it can use it. An operator can
          optionally require a shared token for any action that changes state (starting/stopping a session, taking a
          snapshot, etc.) by setting <code>security.shared_token</code> in <code>config.yaml</code> on the
          Raspberry Pi. If that's configured, paste the same token here — it's attached as the{' '}
          <code>X-EASY-Token</code> header on every non-GET request from this browser, and stored only in this
          browser's local storage. It is not a login system: anyone with the token has the same access.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Current token: <span className="mono">{savedToken ? '••••••••' : 'not set'}</span>
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste the shared token"
              autoComplete="off"
              style={{
                flex: 1,
                minHeight: 36,
                padding: '6px 10px',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 12,
              }}
            />
            <button
              onClick={handleSave}
              disabled={!tokenInput.trim()}
              style={{
                minHeight: 36,
                padding: '6px 16px',
                background: 'var(--accent-interactive)',
                color: 'var(--bg-0)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                fontWeight: 600,
                cursor: tokenInput.trim() ? 'pointer' : 'not-allowed',
                opacity: tokenInput.trim() ? 1 : 0.6,
              }}
            >
              Save
            </button>
            {savedToken && (
              <button
                onClick={handleClear}
                style={{
                  minHeight: 36,
                  padding: '6px 16px',
                  background: 'transparent',
                  color: 'var(--accent-critical)',
                  border: '1px solid var(--accent-critical)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            )}
          </div>
          {saved && <span style={{ fontSize: 11, color: 'var(--accent-ok)' }}>Saved.</span>}
        </div>
      </section>
    </div>
  )
}
