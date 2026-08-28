import { createContext, useContext, type ReactNode } from 'react'
import { useDashboardState } from './useDashboardState'
import type { DashboardState } from '../api/types'

interface DashboardStateContextValue {
  data: DashboardState | null
  error: unknown
  loading: boolean
}

const DashboardStateContext = createContext<DashboardStateContextValue | null>(null)

/**
 * Monta un'unica istanza di polling su /api/dashboard/state per tutta l'app,
 * condivisa da TopBar (health globale) e dalle pagine — evita di duplicare
 * la stessa chiamata aggregata in più componenti.
 */
export function DashboardStateProvider({ children }: { children: ReactNode }) {
  const value = useDashboardState(2000)
  return <DashboardStateContext.Provider value={value}>{children}</DashboardStateContext.Provider>
}

export function useSharedDashboardState(): DashboardStateContextValue {
  const ctx = useContext(DashboardStateContext)
  if (!ctx) {
    throw new Error('useSharedDashboardState must be used within DashboardStateProvider')
  }
  return ctx
}
