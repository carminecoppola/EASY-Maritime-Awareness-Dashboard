import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginForm } from '../components/auth/LoginForm'
import { authErrorMessage, useAuth } from '../hooks/AuthContext'

/**
 * Login raggiungibile volontariamente (dentro la shell normale) quando
 * l'enforcement è spento — es. un operatore che vuole farsi attribuire le
 * proprie azioni nell'audit log, o un Admin che deve raggiungere Users &
 * Roles. Quando l'enforcement è acceso, non serve: LoginGatePage sostituisce
 * l'intera app prima ancora che questa rotta sia raggiungibile.
 */
export function SignInPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.user && !auth.legacy) {
      navigate('/', { replace: true })
    }
  }, [auth.user, auth.legacy, navigate])

  const handleSubmit = async (username: string, password: string) => {
    try {
      await auth.login(username, password)
      navigate('/', { replace: true })
    } catch (e) {
      throw new Error(authErrorMessage(e))
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-6)' }}>
      <div className="easy-authcard" style={{ maxWidth: 360 }}>
        <div className="easy-authbrand">
          <h1 style={{ fontSize: 16 }}>Sign in</h1>
          <div className="easy-authdevice">
            <b>{auth.hostname ?? 'this device'}</b>
          </div>
        </div>
        <LoginForm onSubmit={handleSubmit} autoFocus />
      </div>
    </div>
  )
}
