import { useCallback, useEffect, useId, useState } from 'react'
import { api } from '../api/client'
import type { AuthRole, AuthUser } from '../api/types'
import { AccessDenied } from '../components/auth/AccessDenied'
import { FirstRunSetup } from '../components/auth/FirstRunSetup'
import { authErrorMessage, useAuth } from '../hooks/AuthContext'
import { useStepUp } from '../components/feedback/StepUpProvider'
import { toDate } from '../utils/formatTime'

const ROLES: AuthRole[] = ['viewer', 'operator', 'admin']

function CreateUserForm({ onCreated }: { onCreated: (user: AuthUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AuthRole>('viewer')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usernameId = useId()
  const passwordId = useId()
  const roleId = useId()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || !username.trim() || password.length < 8) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.createAuthUser({ username: username.trim(), password, role })
      onCreated(result.user)
      setUsername('')
      setPassword('')
      setRole('viewer')
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="easy-formgrid" style={{ alignItems: 'end' }}>
      <div className="easy-field">
        <label htmlFor={usernameId}>Username</label>
        <input id={usernameId} className="easy-input" value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} />
      </div>
      <div className="easy-field">
        <label htmlFor={passwordId}>Temporary password</label>
        <input
          id={passwordId}
          className="easy-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="easy-field">
        <label htmlFor={roleId}>Role</label>
        <select
          id={roleId}
          className="easy-input"
          value={role}
          onChange={(e) => setRole(e.target.value as AuthRole)}
          disabled={loading}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="easy-field">
        <button type="submit" className="easy-btn primary" disabled={loading || !username.trim() || password.length < 8}>
          {loading ? 'Creating…' : 'Create user'}
        </button>
      </div>
      {error && (
        <p className="easy-error" style={{ gridColumn: '1 / -1' }}>
          {error}
        </p>
      )}
    </form>
  )
}

function UserRow({ user, isSelf, onChanged }: { user: AuthUser; isSelf: boolean; onChanged: (user: AuthUser) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { runElevated } = useStepUp()

  const handleRoleChange = async (role: AuthRole) => {
    setBusy(true)
    setError(null)
    try {
      const result = await runElevated(
        () => api.updateAuthUser(user.id, { role }),
        `Confirm changing ${user.username}'s role to ${role}.`,
      )
      onChanged(result.user)
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const handleToggleActive = async () => {
    setBusy(true)
    setError(null)
    const willDeactivate = user.active
    try {
      const result = await runElevated(
        () => (willDeactivate ? api.deactivateAuthUser(user.id) : api.updateAuthUser(user.id, { active: true })),
        willDeactivate
          ? `Confirm deactivating ${user.username}. They will be signed out immediately.`
          : `Confirm reactivating ${user.username}.`,
      )
      onChanged(result.user)
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const created = toDate(user.created_at)

  return (
    <tr style={user.active ? undefined : { opacity: 0.55 }}>
      <td className="easy-cell-strong">
        {user.username}
        {isSelf && <span className="easy-userrow-self"> · you</span>}
      </td>
      <td>
        <select
          className="easy-input"
          style={{ height: 32, fontSize: 11 }}
          value={user.role}
          onChange={(e) => handleRoleChange(e.target.value as AuthRole)}
          disabled={busy || isSelf}
          title={isSelf ? 'Change your own role from another admin account' : undefined}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className="easy-tag" style={{ color: user.active ? 'var(--accent-ok)' : 'var(--text-muted)' }}>
          {user.active ? 'ACTIVE' : 'DEACTIVATED'}
        </span>
      </td>
      <td className="mono" title={created?.toLocaleString()}>
        {created ? created.toLocaleDateString() : '—'}
      </td>
      <td>
        <button
          type="button"
          className="easy-btn mini"
          onClick={handleToggleActive}
          disabled={busy || isSelf}
          title={isSelf ? 'You cannot deactivate your own account' : undefined}
        >
          {busy ? 'Working…' : user.active ? 'Deactivate' : 'Reactivate'}
        </button>
        {error && <div className="easy-error" style={{ marginTop: 6 }}>{error}</div>}
      </td>
    </tr>
  )
}

function SecuritySettings() {
  const auth = useAuth()
  const { runElevated } = useStepUp()
  const [pending, setPending] = useState<'enforced' | 'anonymous' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleToggleEnforced = async () => {
    if (auth.enforcementForcedByServer !== null) return
    const next = !auth.enforcementEnabled
    setPending('enforced')
    setError(null)
    try {
      await runElevated(
        () => api.updateAuthSettings({ auth_enforced: next }),
        next
          ? 'Confirm requiring sign-in for this device.'
          : 'Confirm turning sign-in off. The device becomes reachable to anyone on the LAN.',
      )
      await auth.refresh()
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setPending(null)
    }
  }

  const handleToggleAnonymous = async () => {
    const next = !auth.anonymousViewerEnabled
    setPending('anonymous')
    setError(null)
    try {
      await runElevated(
        () => api.updateAuthSettings({ anonymous_viewer_enabled: next }),
        next
          ? 'Confirm allowing anonymous read-only access to this device.'
          : 'Confirm removing anonymous read-only access.',
      )
      await auth.refresh()
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <article className="easy-surface" style={{ marginBottom: 'var(--space-3)' }}>
      <div className="easy-panelhead">
        <h2>Security</h2>
      </div>
      <div className="easy-controls">
        <div className="easy-settingrow" style={{ padding: '12px 0' }}>
          <div>
            <b>Require sign-in</b>
            <small>
              When on, every page and action needs a signed-in role. When off, the dashboard behaves as an open LAN
              device (today's default).
            </small>
            {auth.enforcementForcedByServer !== null && (
              <small style={{ display: 'block', color: 'var(--accent-warn)' }}>
                Forced {auth.enforcementForcedByServer ? 'on' : 'off'} by the server environment — change{' '}
                <span className="mono">EASY_DASHBOARD_ENABLE_AUTH</span> to adjust.
              </small>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={auth.enforcementEnabled}
            aria-label="Require sign-in"
            className="easy-switch easy-control"
            onClick={handleToggleEnforced}
            disabled={pending !== null || auth.enforcementForcedByServer !== null}
          />
        </div>
        <div className="easy-settingrow" style={{ padding: '12px 0' }}>
          <div>
            <b>Allow anonymous Viewer access</b>
            <small>Read-only pages stay reachable without signing in, once sign-in is required.</small>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={auth.anonymousViewerEnabled}
            aria-label="Allow anonymous Viewer access"
            className="easy-switch easy-control"
            onClick={handleToggleAnonymous}
            disabled={pending !== null}
          />
        </div>
        {error && <p className="easy-error">{error}</p>}
      </div>
    </article>
  )
}

function UsersTable({ currentUserId }: { currentUserId: string | undefined }) {
  const [users, setUsers] = useState<AuthUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.listAuthUsers()
      setUsers(result.users)
      setError(null)
    } catch (e) {
      setError(authErrorMessage(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleChanged = (updated: AuthUser) => {
    setUsers((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev))
  }

  const handleCreated = (created: AuthUser) => {
    setUsers((prev) => (prev ? [...prev, created] : [created]))
  }

  return (
    <article className="easy-surface">
      <div className="easy-panelhead">
        <h2>Users</h2>
        <span className="easy-panelnote">{users ? `${users.length} accounts` : ''}</span>
      </div>
      <div style={{ padding: 14, borderBottom: '1px solid var(--border-subtle)' }}>
        <CreateUserForm onCreated={handleCreated} />
      </div>
      {error ? (
        <p className="easy-error" style={{ margin: 14 }}>
          {error}
        </p>
      ) : !users ? (
        <p className="easy-empty" style={{ margin: 14 }}>
          Loading users…
        </p>
      ) : (
        <div className="easy-tablewrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="easy-table">
            <thead>
              <tr>
                <th scope="col">Username</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} onChanged={handleChanged} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

export function UsersRolesPage() {
  const auth = useAuth()

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Administration</div>
          <h1>Users &amp; Roles</h1>
          <p>Local accounts, roles and sign-in requirements for this device.</p>
        </div>
      </section>

      {!auth.setupComplete ? (
        <FirstRunSetup />
      ) : auth.user?.role !== 'admin' ? (
        <AccessDenied requiredRole="admin" yourRole={auth.user?.role ?? null} />
      ) : (
        <>
          <SecuritySettings />
          <UsersTable currentUserId={auth.user?.id} />
        </>
      )}
    </>
  )
}
