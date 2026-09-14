import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { titleForPath } from './navItems'
import { GlobalSystemBanner } from '../feedback/GlobalSystemBanner'

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  // In una SPA il titolo costante non annuncia il cambio pagina: lo screen
  // reader non ha altro segnale di navigazione avvenuta.
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
