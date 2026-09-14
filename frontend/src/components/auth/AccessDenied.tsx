import type { AuthRole } from '../../api/types'

const ROLE_LABEL: Record<AuthRole, string> = { viewer: 'Viewer', operator: 'Operator', admin: 'Admin' }

export function AccessDenied({ requiredRole, yourRole }: { requiredRole: AuthRole; yourRole: AuthRole | null }) {
  return (
    <div className="easy-surface easy-denied" role="alert">
      <div className="easy-denied-icon" aria-hidden>
        !
      </div>
      <h2 style={{ margin: 0, fontSize: 17 }}>403 — Access not allowed</h2>
      <p className="easy-sub" style={{ maxWidth: 44 + 'ch' }}>
        Requires role <b style={{ color: 'var(--text-primary)' }}>{ROLE_LABEL[requiredRole]}</b> or higher.
        {yourRole ? ` You are signed in as ${ROLE_LABEL[yourRole]}.` : ' You are not signed in.'}
      </p>
    </div>
  )
}
