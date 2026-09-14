import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'

// Keep annotation tooling out of the Raspberry production bundle.
const DevAnnotations = import.meta.env.DEV
  ? (await import('agentation')).Agentation
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {DevAnnotations && <DevAnnotations endpoint="http://localhost:4747" />}
  </StrictMode>,
)
