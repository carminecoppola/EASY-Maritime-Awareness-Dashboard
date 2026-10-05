/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Metric card: title, large value, optional status badge and hint.
 */

import type { ReactNode } from 'react'
import type { Tone } from './severityColors'
import { StatusBadge } from './StatusBadge'

interface StatusCardProps {
  title: string
  value: ReactNode
  tone?: Tone
  toneText?: string
  hint?: string
  /** Also colours the value, not just the badge: the same principle used in System Diagnostics (CameraCard, components table). */
  valueTone?: Tone
}

/** Card for one headline value. */
export function StatusCard({ title, value, tone, toneText, hint, valueTone }: StatusCardProps) {
  // The dot repeats the value colour visually (never the only signal: the value
  // itself stays text), so it reads as a "state" even from a distance, before the
  // number is read.
  const dotColor = valueTone?.color ?? tone?.color
  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-panel)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {dotColor && (
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }}
            />
          )}
          <span style={{ color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {title}
          </span>
        </span>
        {tone && <StatusBadge tone={tone} text={toneText} />}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 'var(--font-size-hero)',
          lineHeight: 1.1,
          fontWeight: 700,
          color: valueTone?.color ?? 'var(--text-primary)',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          whiteSpace: 'normal',
        }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )
}
