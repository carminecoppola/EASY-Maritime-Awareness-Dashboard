/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Client-side routes. Each page is a separate lazily loaded chunk.
 */

import { Suspense, lazy } from 'react'
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'

// Every page is loaded only when the operator visits it: the main bundle used
// to hold all pages (Recharts included) in a single 750 KB chunk, most of it
// useless until System Diagnostics is actually opened. With lazy() each page is
// a separate chunk, loaded on demand.
const LiveOverviewPage = lazy(() => import('./pages/LiveOverviewPage').then((m) => ({ default: m.LiveOverviewPage })))
const MissionPage = lazy(() => import('./pages/MissionPage').then((m) => ({ default: m.MissionPage })))
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then((m) => ({ default: m.AnalysisPage })))
const ThermalEventsPage = lazy(() => import('./pages/ThermalEventsPage').then((m) => ({ default: m.ThermalEventsPage })))
const SnapshotsPage = lazy(() => import('./pages/SnapshotsPage').then((m) => ({ default: m.SnapshotsPage })))
const SystemDiagnosticsPage = lazy(() =>
  import('./pages/SystemDiagnosticsPage').then((m) => ({ default: m.SystemDiagnosticsPage })),
)
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })))
const PresentationPage = lazy(() => import('./pages/PresentationPage').then((m) => ({ default: m.PresentationPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const SignInPage = lazy(() => import('./pages/SignInPage').then((m) => ({ default: m.SignInPage })))
const UsersRolesPage = lazy(() => import('./pages/UsersRolesPage').then((m) => ({ default: m.UsersRolesPage })))

/** Shown while a lazily loaded page chunk is downloading. */
function PageFallback() {
  return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
}

/** Application shell with the active page rendered inside a Suspense boundary. */
function AppShellLayout() {
  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}

// In development Vite serves index.html for unknown paths (default SPA
// behaviour). In production the Flask catch-all route (routes/spa.py)
// guarantees the same.
/** Route table: live overview, mission, analysis, thermal events, snapshots, system diagnostics, help, presentation, settings, sign-in and user administration. */
export const router = createBrowserRouter([
  {
    element: <AppShellLayout />,
    children: [
      { index: true, element: <LiveOverviewPage /> },
      { path: 'mission', element: <MissionPage /> },
      { path: 'analysis', element: <AnalysisPage /> },
      { path: 'thermal-events', element: <ThermalEventsPage /> },
      { path: 'snapshots', element: <SnapshotsPage /> },
      // "system" alone would collide with the backend endpoint GET /system (JSON
      // diagnostics, served before the catch-all): a direct refresh on that path
      // would show JSON instead of the SPA.
      { path: 'system-diagnostics', element: <SystemDiagnosticsPage /> },
      { path: 'help', element: <HelpPage /> },
      // Static illustrative view with no hardware, for demos and presentations.
      { path: 'presentation', element: <PresentationPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'admin/users', element: <UsersRolesPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
