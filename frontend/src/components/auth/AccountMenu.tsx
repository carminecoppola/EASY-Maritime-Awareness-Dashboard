import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/AuthContext'

/**
 * Chip nella top bar: mostra chi è collegato con un menu di logout, oppure
 * un link "Sign in" quando nessuno lo è — visibile anche ad enforcement
 * spento, per chi vuole farsi attribuire le proprie azioni nell'audit.
 */
export function AccountMenu() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (auth.status !== 'ready') return null

  if (!auth.user) {
    return (
      <Link className="easy-btn mini" to="/sign-in">
        Sign in
      </Link>
    )
  }

  const initial = auth.user.username.slice(0, 1).toUpperCase()

  return (
    <div className="easy-accountmenu" ref={ref}>
      <button type="button" className="easy-accountchip" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <span className="easy-accountavatar" aria-hidden>
          {initial}
        </span>
        {auth.user.username}
      </button>
      {open && (
        <div className="easy-accountmenu-panel" role="dialog" aria-label="Account">
          <div className="easy-accountname">{auth.user.username}</div>
          <div className="easy-accountmeta">
            {auth.user.role}
            {auth.legacy ? ' · shared token' : ''}
          </div>
          {auth.user.role === 'admin' && (
            <Link className="easy-btn mini" to="/admin/users" style={{ display: 'block', textAlign: 'left', marginBottom: 6 }} onClick={() => setOpen(false)}>
              Users &amp; Roles
            </Link>
          )}
          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              await auth.logout()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
