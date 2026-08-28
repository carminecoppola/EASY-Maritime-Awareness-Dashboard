import type { Tone } from './severityColors'

interface StatusBadgeProps {
  tone: Tone
  /** Testo esplicito da mostrare oltre al colore — mai comunicare stato solo via colore. */
  text?: string
}

export function StatusBadge({ tone, text }: StatusBadgeProps) {
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: tone.color,
        background: tone.dim,
        border: `1px solid ${tone.color}33`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: tone.color,
          flexShrink: 0,
        }}
      />
      {text ?? tone.label}
    </span>
  )
}
