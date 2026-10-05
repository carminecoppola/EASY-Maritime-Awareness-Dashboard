/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Toast notifications: at most three visible, deduplicated by key, critical ones stay until dismissed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Severity } from '../../lib/errors'

/** A toast being displayed. */
interface Toast {
  id: number
  severity: Severity
  title: string
  message?: string
}

/** What a caller passes to `notify`. */
interface ToastInput {
  severity: Severity
  title: string
  message?: string
  /** Same key means the same notice: update it instead of stacking a duplicate. */
  dedupeKey?: string
}

interface ToastContextValue {
  notify: (toast: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_VISIBLE = 3
/** Auto-dismiss time per severity in ms (0 = stays). */
const DURATION: Record<Severity, number> = {
  success: 3500,
  info: 3500,
  neutral: 3500,
  warning: 6000,
  // Blocking failures are never just a toast: they stay until dismissed,
  // accompanied by a persistent state elsewhere.
  critical: 0,
}

/** Provides `notify` and renders the toast stack. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const keyToId = useRef(new Map<string, number>())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    for (const [key, value] of keyToId.current) {
      if (value === id) keyToId.current.delete(key)
    }
  }, [])

  const notify = useCallback(
    ({ severity, title, message, dedupeKey }: ToastInput) => {
      const existingId = dedupeKey ? keyToId.current.get(dedupeKey) : undefined
      const id = existingId ?? nextId.current++
      if (dedupeKey) keyToId.current.set(dedupeKey, id)

      setToasts((prev) => {
        const next = existingId
          ? prev.map((t) => (t.id === id ? { id, severity, title, message } : t))
          : [...prev, { id, severity, title, message }]
        // The oldest leaves when more than three arrive.
        return next.slice(-MAX_VISIBLE)
      })

      const previousTimer = timers.current.get(id)
      if (previousTimer) clearTimeout(previousTimer)
      const duration = DURATION[severity]
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => clearTimeout(timer))
      pending.clear()
    }
  }, [])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="easy-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`easy-toast ${toast.severity}`} role={toast.severity === 'critical' ? 'alert' : 'status'}>
            <div style={{ minWidth: 0 }}>
              <b>{toast.title}</b>
              {toast.message && <span>{toast.message}</span>}
            </div>
            <button type="button" className="easy-toastclose" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Returns an inert notify outside the provider: a toast must never crash a page. */
export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? { notify: () => {} }
}
