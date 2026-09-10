import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  emphasis?: boolean
  gap?: 'space-3' | 'space-4'
}

/** Superficie condivisa (bg-2 + bordo + radius) — sostituisce le costanti PANEL_STYLE duplicate per pagina. */
export function Panel({ children, emphasis = false, gap = 'space-3' }: PanelProps) {
  return (
    <div
      style={{
        padding: 'var(--space-4)',
        background: 'var(--bg-2)',
        border: emphasis ? '2px solid var(--border-strong)' : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-panel)',
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
