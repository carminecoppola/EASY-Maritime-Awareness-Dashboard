import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { LiveOverviewPage } from './pages/LiveOverviewPage'
import { MissionPage } from './pages/MissionPage'
import { ThermalEventsPage } from './pages/ThermalEventsPage'
import { SnapshotsPage } from './pages/SnapshotsPage'
import { SystemDiagnosticsPage } from './pages/SystemDiagnosticsPage'
import { HelpPage } from './pages/HelpPage'

function AppShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

// In dev, Vite serve index.html per path sconosciuti (comportamento SPA di
// default). In produzione la stessa cosa è garantita dalla route catch-all
// Flask introdotta in Fase 5 (unica modifica backend prevista dal piano).
export const router = createBrowserRouter([
  {
    element: <AppShellLayout />,
    children: [
      { index: true, element: <LiveOverviewPage /> },
      { path: 'mission', element: <MissionPage /> },
      { path: 'thermal-events', element: <ThermalEventsPage /> },
      { path: 'snapshots', element: <SnapshotsPage /> },
      { path: 'system', element: <SystemDiagnosticsPage /> },
      { path: 'help', element: <HelpPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
