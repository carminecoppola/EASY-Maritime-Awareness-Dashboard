import { NavLink } from 'react-router-dom'
import { useSharedDashboardState } from '../../hooks/DashboardStateContext'
import { NavIcon } from './NavIcon'
import { NAV_GROUPS } from './navItems'

export function Sidebar() {
  const { data, error, loading } = useSharedDashboardState()
  const system = data?.health?.system

  const connected = !error && Boolean(data)
  const connectionLabel = error ? 'Disconnected' : loading && !data ? 'Connecting…' : 'Connected'
  const dotColor = error ? 'var(--accent-critical)' : connected ? 'var(--accent-ok)' : 'var(--text-muted)'

  return (
    <aside className="easy-sidebar">
      <div className="easy-brand">
        <div className="easy-brand-mark" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="9" cy="9" r="1.6" fill="currentColor" />
            <path d="M9 1v2.4M9 14.6V17M17 9h-2.4M3.4 9H1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
        <div className="easy-brand-text">
          <span className="easy-brand-name">EASY</span>
          <small className="easy-brand-sub">Maritime Awareness</small>
        </div>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="easy-navlabel">{group.label}</div>
          <nav className="easy-nav" aria-label={group.label}>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} title={item.label}>
                <span className="easy-nav-ico" aria-hidden>
                  <NavIcon name={item.icon} />
                </span>
                <span className="easy-nav-label-text">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      ))}

      <div className="easy-sidebottom">
        <div className="easy-device">
          <span className="easy-device-dot" style={{ background: dotColor }} aria-hidden />
          <div className="easy-device-text">
            <strong className="mono">{system?.hostname ?? 'Host unavailable'}</strong>
            <small>
              {connectionLabel}
              {system?.ip_address ? ` · ${system.ip_address}` : ''}
            </small>
          </div>
        </div>
      </div>
    </aside>
  )
}
