import type { ReactNode } from 'react'
import type { Tone } from './severityColors'
import { StatusBadge } from './StatusBadge'

interface StatusCardProps {
  title: string
  value: ReactNode
  tone?: Tone
  toneText?: string
  hint?: string
}

export function StatusCard({ title, value, tone, toneText, hint }: StatusCardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
        {tone && <StatusBadge tone={tone} text={toneText} />}
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )
}
