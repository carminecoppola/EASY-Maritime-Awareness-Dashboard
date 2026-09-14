import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api/client'
import { getAuthToken, setAuthToken } from '../api/config'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { PREFERENCES, usePreference } from '../lib/preferences'

type SectionId = 'security' | 'safety' | 'about'

const SECTIONS: { id: SectionId; group: string; label: string; title: string; description: string }[] = [
  {
    id: 'security',
    group: 'Workspace',
    label: 'Security & access',
    title: 'Security & access',
    description: 'Configure how this browser authenticates state-changing actions on the Raspberry Pi.',
  },
  {
    id: 'safety',
    group: 'Workspace',
    label: 'Session safety',
    title: 'Session safety',
    description: 'Operator protections for potentially disruptive actions, stored in this browser.',
  },
  {
    id: 'about',
    group: 'System',
    label: 'About this device',
    title: 'About this device',
    description: 'Identity reported by the connected Raspberry Pi.',
  },
]

function AuthStatusTag({ authRequired }: { authRequired: boolean | null }) {
  // null non è "accesso aperto": è "non è stato possibile leggere la
  // configurazione", e va detto esplicitamente.
  if (authRequired === null) {
    return (
      <span className="easy-tag" style={{ color: 'var(--accent-warn)' }}>
        ACCESS CONFIGURATION UNAVAILABLE
      </span>
    )
  }
  return (
    <span className="easy-tag" style={{ color: authRequired ? 'var(--accent-ok)' : 'var(--text-muted)' }}>
      {authRequired ? 'TOKEN REQUIRED' : 'OPEN ACCESS'}
    </span>
  )
}

export function SettingsPage() {
  const [section, setSection] = useState<SectionId>('security')
  const [tokenInput, setTokenInput] = useState('')
  const [savedToken, setSavedToken] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState<boolean | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmEnd, setConfirmEnd] = usePreference('confirmEndMission')
  const tokenId = useId()
  const dashboard = useSharedDashboardState()
  const system = dashboard.data?.health?.system

  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let active = true
    setSavedToken(getAuthToken())
    api
      .getConfig()
      .then((cfg) => active && setAuthRequired(cfg.auth_required))
      .catch(() => active && setAuthRequired(null))
    return () => {
      active = false
      clearTimeout(savedTimer.current)
    }
  }, [])

  const handleSave = () => {
    setAuthToken(tokenInput.trim() || null)
    setSavedToken(getAuthToken())
    setTokenInput('')
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    setAuthToken(null)
    setSavedToken(null)
  }

  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  const groups = Array.from(new Set(SECTIONS.map((s) => s.group)))

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Local configuration</div>
          <h1>Settings</h1>
          <p>Per-browser preferences and secure access for this EASY device.</p>
        </div>
        <div className="easy-updated">
          Changes apply to <b>this browser</b>
        </div>
      </section>

      <section className="easy-settingsgrid">
        <aside className="easy-surface easy-settingnav">
          {groups.map((group) => (
            <div key={group} role="tablist" aria-label={`${group} settings`}>
              <small>{group}</small>
              {SECTIONS.filter((s) => s.group === group).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${item.id}`}
                  aria-controls="settings-panel"
                  aria-selected={section === item.id}
                  tabIndex={section === item.id ? 0 : -1}
                  onClick={() => setSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <article
          className="easy-surface easy-settingbody"
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${section}`}
        >
          <h2>{active.title}</h2>
          <p>{active.description}</p>

          {section === 'security' && (
            <>
              <div className="easy-group">
                <div className="easy-ghead">
                  <b>Shared access token</b>
                  <span>Optional protection for actions such as starting missions and capturing frames.</span>
                </div>
                <div className="easy-settingrow" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <b>Authentication status</b>
                      <small>
                        {authRequired === null
                          ? 'The backend access configuration could not be read'
                          : authRequired
                            ? 'The backend currently requires a shared token'
                            : 'The backend accepts requests without a token'}
                      </small>
                    </div>
                    <span style={{ marginLeft: 'auto' }}>
                      <AuthStatusTag authRequired={authRequired} />
                    </span>
                  </div>
                  <div className="easy-tokenrow">
                    <label htmlFor={tokenId} className="easy-fieldlabel" style={{ width: '100%', marginBottom: 0 }}>
                      Shared token
                    </label>
                    <input
                      id={tokenId}
                      className="easy-input"
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Paste the shared token"
                      autoComplete="off"
                    />
                    <button type="button" className="easy-btn primary" onClick={handleSave} disabled={!tokenInput.trim()}>
                      Save token
                    </button>
                    {savedToken && (
                      <button type="button" className="easy-btn danger" onClick={handleClear}>
                        Clear
                      </button>
                    )}
                    {saved && <span style={{ color: 'var(--accent-ok)', fontSize: 11, alignSelf: 'center' }}>Saved ✓</span>}
                  </div>
                </div>
                <div className="easy-settingrow">
                  <div>
                    <b>Token storage</b>
                    <small>Stored only in this browser's local storage</small>
                  </div>
                  <span className="easy-control easy-tag mono">
                    {savedToken ? 'CURRENT TOKEN · ••••••••' : 'NO TOKEN STORED'}
                  </span>
                </div>
              </div>

              <p className="easy-callout" style={{ marginTop: 0 }}>
                <b>How access works.</b> The dashboard uses an open-LAN trust model by default. When{' '}
                <span className="mono">security.shared_token</span> is configured on the Raspberry Pi, this browser
                sends it as the <span className="mono">X-EASY-Token</span> header on non-GET requests. This is shared
                device access, not an individual account system.
              </p>
            </>
          )}

          {section === 'safety' && (
            <div className="easy-group">
              <div className="easy-ghead">
                <b>Operator protections</b>
                <span>These preferences live in this browser and take effect immediately.</span>
              </div>
              <div className="easy-settingrow">
                <div>
                  <b>{PREFERENCES.confirmEndMission.label}</b>
                  <small>{PREFERENCES.confirmEndMission.description}</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={confirmEnd}
                  aria-label={PREFERENCES.confirmEndMission.label}
                  className="easy-switch easy-control"
                  onClick={() => setConfirmEnd(!confirmEnd)}
                />
              </div>
            </div>
          )}

          {section === 'about' && (
            <div className="easy-group">
              <div className="easy-ghead">
                <b>Connected device</b>
                <span>Reported by the backend; not editable from the dashboard.</span>
              </div>
              {dashboard.error && !system ? (
                <p className="easy-error" style={{ margin: 13 }}>
                  Device identity unavailable — the backend could not be reached.
                </p>
              ) : (
                [
                  ['Hostname', system?.hostname],
                  ['IP address', system?.ip_address],
                  ['Device', system?.model],
                  ['Operating system', system?.os_release],
                  ['Python runtime', system?.python_version],
                  ['Uptime', system?.uptime_human],
                ].map(([label, value]) => (
                  <div className="easy-settingrow" key={String(label)}>
                    <div>
                      <b>{label}</b>
                    </div>
                    <span className="easy-control mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {value ? String(value) : 'Unavailable'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </article>
      </section>
    </>
  )
}
