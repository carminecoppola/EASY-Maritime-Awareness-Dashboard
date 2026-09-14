import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '../../api/client'
import { authErrorMessage } from '../../hooks/AuthContext'
import { isStepUpRequiredBody } from '../../api/types'

interface StepUpContextValue {
  /** Mostra il dialogo di conferma password; risolve true se sbloccata, false se annullata. */
  requestStepUp: (reason?: string) => Promise<boolean>
  /**
   * Esegue `action`; se fallisce con "step_up_required", apre il dialogo e,
   * se confermato, ritenta una sola volta. Così ogni azione distruttiva non
   * deve gestire il codice 403 a mano — solo passare per questo wrapper.
   */
  runElevated: <T,>(action: () => Promise<T>, reason?: string) => Promise<T>
}

const StepUpContext = createContext<StepUpContextValue | null>(null)

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)
  const passwordId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback((confirmed: boolean) => {
    setOpen(false)
    setPassword('')
    setError(null)
    resolverRef.current?.(confirmed)
    resolverRef.current = null
  }, [])

  const requestStepUp = useCallback((why?: string) => {
    setReason(why)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const runElevated = useCallback(
    async <T,>(action: () => Promise<T>, why?: string): Promise<T> => {
      try {
        return await action()
      } catch (e) {
        if (e instanceof ApiError && e.status === 403 && isStepUpRequiredBody(e.body)) {
          const confirmed = await requestStepUp(why)
          if (!confirmed) throw e
          return await action()
        }
        throw e
      }
    },
    [requestStepUp],
  )

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || !password) return
    setLoading(true)
    setError(null)
    try {
      await api.authStepUp({ password })
      close(true)
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const value = useMemo<StepUpContextValue>(() => ({ requestStepUp, runElevated }), [requestStepUp, runElevated])

  return (
    <StepUpContext.Provider value={value}>
      {children}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${passwordId}-title`}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(4, 6, 10, 0.72)',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close(false)
          }}
        >
          <form onSubmit={handleSubmit} className="easy-authcard" style={{ maxWidth: 340 }}>
            <h2 id={`${passwordId}-title`} style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--text-primary)' }}>
              Confirm your password
            </h2>
            <p className="easy-sub" style={{ margin: '0 0 var(--space-3)' }}>
              {reason ?? 'This action needs your password again before it proceeds.'}
            </p>
            <div className="easy-authfield">
              <label htmlFor={passwordId}>Password</label>
              <input
                ref={inputRef}
                id={passwordId}
                className="easy-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            {error && <p className="easy-error">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" className="easy-btn" style={{ flex: 1 }} onClick={() => close(false)} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="easy-btn primary" style={{ flex: 1 }} disabled={loading || !password}>
                {loading ? 'Confirming…' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}
    </StepUpContext.Provider>
  )
}

export function useStepUp(): StepUpContextValue {
  const ctx = useContext(StepUpContext)
  if (!ctx) {
    throw new Error('useStepUp must be used within StepUpProvider')
  }
  return ctx
}
