import { NavLink } from 'react-router-dom'
import { NavIcon, type NavIconName } from './NavIcon'

const NAV_ITEMS: { to: string; label: string; icon: NavIconName }[] = [
  { to: '/', label: 'Live Overview', icon: 'live' },
  { to: '/mission', label: 'Mission', icon: 'mission' },
  { to: '/thermal-events', label: 'Thermal & Events', icon: 'thermal' },
  { to: '/snapshots', label: 'Snapshots', icon: 'snapshots' },
  { to: '/system-diagnostics', label: 'System Diagnostics', icon: 'diagnostics' },
  { to: '/help', label: 'Help', icon: 'help' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function Sidebar() {
  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-4) var(--space-3)',
        gap: 'var(--space-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-2) var(--space-5)' }}>
        {/* Mirino di rilevamento come marchio — stesso segno usato per la
            voce "Live Overview", ripete visivamente cosa fa il prodotto. */}
        <svg width="22" height="22" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="6.5" stroke="var(--accent-brand)" strokeWidth="1.4" />
          <circle cx="9" cy="9" r="1.6" fill="var(--accent-brand)" />
          <path d="M9 1v2.4M9 14.6V17M17 9h-2.4M3.4 9H1" stroke="var(--accent-brand)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div>
          <div className="mono" style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: 16, color: 'var(--text-primary)' }}>
            EASY
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Maritime Awareness
          </div>
        </div>
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            borderLeft: isActive ? '2px solid var(--accent-brand)' : '2px solid transparent',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 500,
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: isActive ? 'var(--bg-3)' : 'transparent',
          })}
        >
          <span aria-hidden style={{ display: 'flex', color: 'var(--accent-interactive)' }}>
            <NavIcon name={item.icon} />
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
