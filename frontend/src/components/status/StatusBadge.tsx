/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Small pill showing a status as a coloured dot plus text.
 */

import type { Tone } from './severityColors'

interface StatusBadgeProps {
  tone: Tone
  /** Explicit text shown in addition to the colour: never communicate state by colour alone. */
  text?: string
}

/** Badge for a tone, with the tone label unless `text` is given. */
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
