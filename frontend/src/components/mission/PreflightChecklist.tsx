/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Pre-flight checklist panel shown next to the mission form.
 */

import { CHECK_COLOR, CHECK_GLYPH, type PreflightCheck } from '../../lib/preflight'

/** One row per check with a glyph, its detail and its state, coloured by level. */
export function PreflightChecklist({ checks }: { checks: PreflightCheck[] }) {
  return (
    <aside className="easy-panel">
      <div className="easy-panelhead plain">
        <div>
          <h2>Preflight checklist</h2>
          <p>Live verification before collection begins.</p>
        </div>
        <span className="easy-step" aria-hidden>
          ✓
        </span>
      </div>

      <ul className="easy-checklist">
        {checks.map((check) => (
          <li className="easy-check" key={check.id}>
            <span className="easy-checkmark" style={{ color: CHECK_COLOR[check.level] }} aria-hidden>
              {CHECK_GLYPH[check.level]}
            </span>
            <div>
              <b>{check.label}</b>
              <small>{check.detail}</small>
            </div>
            <span className="easy-state" style={{ color: CHECK_COLOR[check.level] }}>
              {check.state}
            </span>
          </li>
        ))}
      </ul>

      <p className="easy-callout">
        Paired capture saves one stereo RGB frame and a thermal frame under one capture-set identifier.
      </p>
    </aside>
  )
}
