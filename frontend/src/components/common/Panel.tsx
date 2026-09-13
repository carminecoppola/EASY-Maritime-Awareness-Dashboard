import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  emphasis?: boolean
  gap?: 'space-3' | 'space-4'
  /**
   * Prima ogni pannello (primario o di contorno) usava la stessa ombra e lo
   * stesso bordo — nessuna differenza visiva tra "questo conta ora" e "qui
   * per consultazione". 'primary' porta ombra + filo superiore d'accento,
   * 'flat' abbassa il pannello sullo sfondo (nessuna ombra, bordo più
   * debole) per i contenuti di consultazione (tabelle, impostazioni).
   */
  variant?: 'primary' | 'flat'
}

/** Superficie condivisa — sostituisce le costanti PANEL_STYLE duplicate per pagina. */
export function Panel({ children, emphasis = false, gap = 'space-3', variant = 'primary' }: PanelProps) {
  const isPrimary = variant === 'primary'
  const sideBorder = emphasis ? '2px solid var(--border-strong)' : '1px solid var(--border-subtle)'
  // Lati espliciti invece di mescolare lo shorthand 'border' con un
  // 'borderTop' condizionale: mescolarli fa sparire border-right/bottom/left
  // (verificato in jsdom, dove impostare la sola longhand dopo lo shorthand
  // svuota gli altri tre lati anziche' sovrascrivere solo il top).
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
