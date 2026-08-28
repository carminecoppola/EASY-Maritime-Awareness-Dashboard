import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Live Overview', icon: '◎' },
  { to: '/mission', label: 'Mission', icon: '▤' },
  { to: '/thermal-events', label: 'Thermal & Events', icon: '△' },
  { to: '/snapshots', label: 'Snapshots', icon: '▦' },
  { to: '/system', label: 'System', icon: '⚙' },
  { to: '/help', label: 'Help', icon: '?' },
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
      <div style={{ padding: '0 var(--space-2) var(--space-5)' }}>
        <div style={{ fontWeight: 700, letterSpacing: '0.02em', fontSize: 15 }}>EASY</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Maritime Awareness
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
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 500,
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: isActive ? 'var(--bg-3)' : 'transparent',
          })}
        >
          <span aria-hidden style={{ width: 18, textAlign: 'center', color: 'var(--accent-interactive)' }}>
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
