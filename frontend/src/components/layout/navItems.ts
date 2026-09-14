import type { NavIconName } from './NavIcon'

export interface NavItem {
  to: string
  label: string
  icon: NavIconName
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { to: '/', label: 'Live Overview', icon: 'live' },
      { to: '/mission', label: 'Mission', icon: 'mission' },
      { to: '/analysis', label: 'AI Analysis', icon: 'analysis' },
      { to: '/thermal-events', label: 'Thermal & Events', icon: 'thermal' },
      { to: '/snapshots', label: 'Snapshots', icon: 'snapshots' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/system-diagnostics', label: 'System Diagnostics', icon: 'diagnostics' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
      { to: '/help', label: 'Help', icon: 'help' },
    ],
  },
  {
    label: 'Administration',
    items: [{ to: '/admin/users', label: 'Users & Roles', icon: 'users' }],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

/** Pagine raggiungibili ma non elencate nella navigazione. */
const EXTRA_TITLES: Record<string, string> = {
  '/presentation': 'Presentation Preview',
  '/sign-in': 'Sign in',
}

export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Live Operations'
  const extra = Object.keys(EXTRA_TITLES).find((path) => pathname.startsWith(path))
  if (extra) return EXTRA_TITLES[extra]
  const match = ALL_ITEMS.find((item) => item.to !== '/' && pathname.startsWith(item.to))
  return match?.label ?? 'EASY'
}
