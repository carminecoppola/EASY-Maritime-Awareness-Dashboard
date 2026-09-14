import { CHECK_COLOR, CHECK_GLYPH, type PreflightCheck } from '../../lib/preflight'

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
        Synchronized capture saves RGB Left, RGB Right and Thermal under one capture-set identifier.
      </p>
    </aside>
  )
}
