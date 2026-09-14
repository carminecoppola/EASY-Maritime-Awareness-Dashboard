import { createContext, useContext, type ReactNode } from 'react'
import { useDashboardState } from './useDashboardState'
import type { DashboardState } from '../api/types'

interface DashboardStateContextValue {
  data: DashboardState | null
  error: unknown
  loading: boolean
  failures: number
  lastSuccessAt: number | null
  refresh: () => void
}

const DashboardStateContext = createContext<DashboardStateContextValue | null>(null)

/**
 * Monta un'unica istanza di polling su /api/dashboard/state per tutta l'app,
 * condivisa da TopBar (health globale) e dalle pagine — evita di duplicare
 * la stessa chiamata aggregata in più componenti.
 */
export function DashboardStateProvider({ children }: { children: ReactNode }) {
  // Senza limiti espliciti /api/dashboard/state restituisce l'intero log
  // eventi e l'intera galleria (≈3,4 MB, ~2,5 s a richiesta): con un
  // intervallo di 2 s le richieste superavano il timeout del client e
  // venivano abortite, lasciando la dashboard senza dati. Le pagine che
  // servono liste complete usano i propri endpoint dedicati.
  // 3 s, non 2: la risposta impiega ~2 s sul Raspberry, quindi a 2 s la
  // richiesta successiva partiva praticamente sopra la precedente.
  const value = useDashboardState(3000, { eventsLimit: 50, snapshotsLimit: 12 })
  return <DashboardStateContext.Provider value={value}>{children}</DashboardStateContext.Provider>
}

export function useSharedDashboardState(): DashboardStateContextValue {
  const ctx = useContext(DashboardStateContext)
  if (!ctx) {
    throw new Error('useSharedDashboardState must be used within DashboardStateProvider')
  }
  return ctx
}
