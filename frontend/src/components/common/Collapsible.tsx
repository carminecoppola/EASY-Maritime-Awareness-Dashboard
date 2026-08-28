import { useState, type ReactNode } from 'react'

interface CollapsibleProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function Collapsible({ title, defaultOpen = false, children }: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 'var(--space-2) 0',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          transition: 'transform 0.2s ease',
          transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}>
          ▼
        </span>
        {title}
      </button>
      {isOpen && (
        <div style={{ paddingLeft: 'var(--space-3)' }}>
          {children}
        </div>
      )}
    </div>
  )
}
