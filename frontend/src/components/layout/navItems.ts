/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Navigation structure and page titles.
 */

import type { NavIconName } from './NavIcon'

/** One navigation entry. */
export interface NavItem {
  to: string
  label: string
  icon: NavIconName
}

/** Operations, System and Administration groups. */
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

/** Pages that can be reached but are not listed in the navigation. */
const EXTRA_TITLES: Record<string, string> = {
  '/presentation': 'Presentation Preview',
  '/sign-in': 'Sign in',
}

/** Page title for a route path (`Live Operations` for `/`, `EASY` when unknown). */
export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Live Operations'
  const extra = Object.keys(EXTRA_TITLES).find((path) => pathname.startsWith(path))
  if (extra) return EXTRA_TITLES[extra]
  const match = ALL_ITEMS.find((item) => item.to !== '/' && pathname.startsWith(item.to))
  return match?.label ?? 'EASY'
}
