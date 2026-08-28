import { RouterProvider } from 'react-router-dom'
import { DashboardStateProvider } from './hooks/DashboardStateContext'
import { router } from './routes'

function App() {
  return (
    <DashboardStateProvider>
      <RouterProvider router={router} />
    </DashboardStateProvider>
  )
}

export default App
