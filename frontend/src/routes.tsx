import { Suspense, lazy } from 'react'
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'

// Ogni pagina è caricata solo quando l'operatore la visita: il bundle
// principale conteneva tutte e 6 le pagine (Recharts incluso) in un unico
// chunk da 750KB — la maggior parte inutile finché non si apre davvero
// System Diagnostics. Con lazy() ogni pagina diventa un chunk separato,
// caricato on-demand.
const LiveOverviewPage = lazy(() => import('./pages/LiveOverviewPage').then((m) => ({ default: m.LiveOverviewPage })))
const MissionPage = lazy(() => import('./pages/MissionPage').then((m) => ({ default: m.MissionPage })))
const ThermalEventsPage = lazy(() => import('./pages/ThermalEventsPage').then((m) => ({ default: m.ThermalEventsPage })))
const SnapshotsPage = lazy(() => import('./pages/SnapshotsPage').then((m) => ({ default: m.SnapshotsPage })))
const SystemDiagnosticsPage = lazy(() =>
  import('./pages/SystemDiagnosticsPage').then((m) => ({ default: m.SystemDiagnosticsPage })),
)
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })))
const PresentationPage = lazy(() => import('./pages/PresentationPage').then((m) => ({ default: m.PresentationPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function PageFallback() {
  return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
}

function AppShellLayout() {
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
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
      // "system" da solo collide con l'endpoint backend GET /system
      // (diagnostica JSON, servito prima della catch-all): un refresh
      // diretto su quel path mostrerebbe JSON invece della SPA.
      { path: 'system-diagnostics', element: <SystemDiagnosticsPage /> },
      { path: 'help', element: <HelpPage /> },
      // Vista statica illustrativa senza hardware, per demo/presentazioni —
      // equivalente SPA del vecchio /paper-preview lato Jinja (rimosso in
      // Fase 5 insieme al resto di pages_bp).
      { path: 'presentation', element: <PresentationPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
