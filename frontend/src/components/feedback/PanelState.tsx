/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Placeholder for a panel that cannot show data (loading, empty, error or unavailable).
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TechnicalDetails } from './TechnicalDetails'

/** Reason a panel has nothing to show. */
type StateKind = 'loading' | 'empty' | 'error' | 'unavailable'

/** Glyph, colour and ARIA role of each state. */
const PRESENTATION: Record<StateKind, { glyph: string; color: string; role: 'status' | 'alert' }> = {
  loading: { glyph: '…', color: 'var(--text-muted)', role: 'status' },
  empty: { glyph: '·', color: 'var(--text-muted)', role: 'status' },
  error: { glyph: '×', color: 'var(--accent-critical)', role: 'alert' },
  unavailable: { glyph: '!', color: 'var(--accent-warn)', role: 'status' },
}

interface PanelStateProps {
  kind: StateKind
  title: string
  children?: ReactNode
  onRetry?: () => void
  retrying?: boolean
  actionTo?: string
  actionLabel?: string
  technicalDetail?: string
}

/**
 * State of a panel that cannot show data. It never leaves an empty box: it says
 * what is missing and which action is available.
 */
export function PanelState({
  kind,
  title,
  children,
  onRetry,
  retrying = false,
  actionTo,
  actionLabel,
  technicalDetail,
}: PanelStateProps) {
  const style = PRESENTATION[kind]
  return (
    <div className="easy-panelstate" role={style.role} style={{ color: style.color }}>
      <span className="easy-stateicon" aria-hidden>
        {style.glyph}
      </span>
      <b>{title}</b>
      {children && <div style={{ color: 'var(--text-muted)' }}>{children}</div>}
      {technicalDetail && (
        <div style={{ textAlign: 'left', maxWidth: 520, margin: '10px auto 0' }}>
          <TechnicalDetails detail={technicalDetail} />
        </div>
      )}
      {(onRetry || actionTo) && (
        <div className="easy-stateactions">
          {onRetry && (
            <button type="button" className="easy-btn mini" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Retrying…' : 'Retry now'}
            </button>
          )}
          {actionTo && actionLabel && (
            <Link className="easy-btn mini" to={actionTo}>
              {actionLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
