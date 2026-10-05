/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Shared surface for page content.
 */

import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  emphasis?: boolean
  gap?: 'space-3' | 'space-4'
  /**
   * Every panel (primary or secondary) used to share the same shadow and border,
   * with no visual difference between "this matters now" and "here for
   * reference". 'primary' carries a shadow and an accent top line; 'flat' lowers
   * the panel into the background (no shadow, weaker border) for reference
   * content such as tables and settings.
   */
  variant?: 'primary' | 'flat'
}

/** Shared surface, replacing the PANEL_STYLE constants that were duplicated per page. */
export function Panel({ children, emphasis = false, gap = 'space-3', variant = 'primary' }: PanelProps) {
  const isPrimary = variant === 'primary'
  const sideBorder = emphasis ? '2px solid var(--border-strong)' : '1px solid var(--border-subtle)'
  // Explicit sides instead of mixing the 'border' shorthand with a conditional
  // 'borderTop': mixing them makes border-right/bottom/left disappear (verified
  // in jsdom, where setting only the longhand after the shorthand clears the
  // other three sides instead of overriding just the top).
  return (
    <div
      style={{
        padding: 'var(--space-4)',
        background: 'var(--bg-2)',
        borderTop: emphasis ? '2px solid var(--accent-brand)' : sideBorder,
        borderRight: sideBorder,
        borderBottom: sideBorder,
        borderLeft: sideBorder,
        borderRadius: 'var(--radius-md)',
        boxShadow: isPrimary ? 'var(--shadow-panel)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: `var(--${gap})`,
        minWidth: 0,
      }}
    >
      {children}
    </div>
  )
}
