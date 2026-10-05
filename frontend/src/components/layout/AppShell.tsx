/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Application frame: sidebar, top bar, system banner and the routed page.
 */

import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { titleForPath } from './navItems'
import { GlobalSystemBanner } from '../feedback/GlobalSystemBanner'

/** Wraps the active page with the persistent navigation and keeps `document.title` in sync with the route. */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  // In a single-page app a constant title does not announce a page change: a
  // screen reader has no other signal that navigation happened.
  useEffect(() => {
    document.title = `${titleForPath(pathname)} · EASY Maritime Awareness`
  }, [pathname])

  return (
    <div className="easy-app">
      <Sidebar />
      <div className="easy-main">
        <TopBar />
        <main className="easy-content">
          <GlobalSystemBanner />
          {children}
        </main>
      </div>
    </div>
  )
}
