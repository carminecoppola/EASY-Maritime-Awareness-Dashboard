import { RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/AuthContext'
import { DashboardStateProvider } from './hooks/DashboardStateContext'
import { ToastProvider } from './components/feedback/ToastProvider'
import { StepUpProvider } from './components/feedback/StepUpProvider'
import { LoginGatePage } from './pages/LoginGatePage'
import { router } from './routes'

function Gate() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    // Volutamente silenzioso: un flash di stato non deve competere con lo
    // splash reale della pagina (che segue subito, appena nota la risposta).
    return null
  }

  // Solo qui la shell resta smontata del tutto: l'enforcement è attivo e
  // nessuna identità è nota, quindi nessun dato operativo deve comparire
  // prima dell'accesso. In ogni altro caso (enforcement spento, oppure
  // acceso con un'identità valida) l'app normale, incluso il polling
  // condiviso, parte come sempre.
  if (auth.enforcementEnabled && !auth.user) {
    return <LoginGatePage />
  }

  return (
    <DashboardStateProvider>
      <ToastProvider>
        <StepUpProvider>
          <RouterProvider router={router} />
        </StepUpProvider>
      </ToastProvider>
    </DashboardStateProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

export default App
