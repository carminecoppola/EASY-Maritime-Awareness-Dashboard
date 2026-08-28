import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { useSessionList } from '../hooks/useSessionList'
import { SessionStartForm } from '../components/mission/SessionStartForm'
import { SessionHistoryTable } from '../components/mission/SessionHistoryTable'
import { ManifestStats } from '../components/mission/ManifestStats'
import { AcquisitionStatusSection } from '../components/mission/AcquisitionStatusSection'
import { StatusCard } from '../components/status/StatusCard'
import { StatusBadge } from '../components/status/StatusBadge'
import { Collapsible } from '../components/common/Collapsible'
import { toneForRunningStatus } from '../components/status/severityColors'
import type { SessionManifestCounts } from '../api/types'

export function MissionPage(): ReactNode {
  const dashboard = useSharedDashboardState()
  const { sessions, loading: sessionListLoading, refresh: refreshSessionList, error: sessionListError } = useSessionList()
  const [currentManifest, setCurrentManifest] = useState<SessionManifestCounts | null>(null)
  const [manifestLoading, setManifestLoading] = useState(false)

  const dashboardSession = dashboard.data?.session
  const currentSession = dashboardSession?.current ?? null
  const isRunning = dashboardSession?.running ?? false
  const acquisitionStatus = dashboard.data?.acquisition

  // Carica il manifest della sessione corrente quando cambia
  const loadCurrentManifest = useCallback(async () => {
    if (!currentSession?.session_id) {
      setCurrentManifest(null)
      return
    }
    setManifestLoading(true)
    try {
      const manifest = await api.getSessionManifest(currentSession.session_id)
      setCurrentManifest(manifest.counts)
    } catch (e) {
      console.error('Failed to load current session manifest:', e)
    } finally {
      setManifestLoading(false)
    }
  }, [currentSession?.session_id])

  // Carica il manifest anche all'apertura della pagina se una sessione è
  // già attiva — prima veniva richiesto SOLO dopo un'azione start/stop,
  // quindi restava vuoto per l'intera durata di una sessione avviata prima
  // di navigare su questa pagina.
  useEffect(() => {
    loadCurrentManifest()
  }, [loadCurrentManifest])

  // Dopo uno start/stop: ricarica il manifest della sessione corrente E lo
  // storico sessioni, che altrimenti resta fermo allo snapshot caricato al
  // mount (useSessionList non fa polling automatico di proposito).
  const handleSessionChanged = useCallback(async () => {
    await Promise.all([loadCurrentManifest(), refreshSessionList()])
  }, [loadCurrentManifest, refreshSessionList])

  // Formato durata per la sessione corrente
  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds < 0) return '—'
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${(seconds / 3600).toFixed(1)}h`
  }

  // Formatta data
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const sessionStatusTone = toneForRunningStatus(isRunning ? 'RUNNING' : 'STOPPED')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 var(--space-1) 0', color: 'var(--text-primary)' }}>
          Mission
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          Start and manage capture sessions
        </p>
      </div>

      {/* PRIMARY: Session Start/Stop Form — the main action */}
      {dashboardSession ? (
        <SessionStartForm
          currentSession={currentSession}
          isRunning={isRunning}
          onSessionChanged={handleSessionChanged}
        />
      ) : null}

      {/* SECONDARY: Current Session Status & Details */}
      {dashboardSession && currentSession ? (
        <div style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Session
            </h2>
            <StatusBadge tone={sessionStatusTone} text={isRunning ? 'RUNNING' : 'STOPPED'} />
          </div>

          {currentSession.session_id ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 'var(--space-2)',
            }}>
              <StatusCard
                title="Session ID"
                value={
                  <span title={currentSession.session_id} style={{ fontSize: 14 }}>
                    {currentSession.session_id}
                  </span>
                }
              />
              <StatusCard title="Start Time" value={formatDate(currentSession.start_time)} />
              <StatusCard title="Duration" value={formatDuration(currentSession.duration)} />
              {currentSession.operator && <StatusCard title="Operator" value={currentSession.operator} />}
              {currentSession.mode && <StatusCard title="Mode" value={currentSession.mode} />}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No session running
            </div>
          )}

          {/* Current Session Editable Context */}
          {currentSession.editable ? (
            <div style={{
              padding: 'var(--space-3)',
              background: 'var(--bg-1)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
            }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 var(--space-2) 0', textTransform: 'uppercase' }}>
                Mission Context
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {currentSession.editable.operator ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Operator:</span>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{currentSession.editable.operator}</span>
                  </div>
                ) : null}
                {currentSession.editable.notes ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Notes:</span>
                    <span className="mono" style={{ color: 'var(--text-primary)', maxWidth: 300, textAlign: 'right' }}>{currentSession.editable.notes}</span>
                  </div>
                ) : null}
                {currentSession.editable.campaign ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Campaign:</span>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{currentSession.editable.campaign}</span>
                  </div>
                ) : null}
                {currentSession.editable.location ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Location:</span>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{currentSession.editable.location}</span>
                  </div>
                ) : null}
                {currentSession.editable.weather ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Weather:</span>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{currentSession.editable.weather}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Current Session Manifest */}
      {manifestLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Loading manifest...
        </div>
      ) : null}
      {currentSession && currentManifest && !manifestLoading ? (
        <ManifestStats counts={currentManifest} title="Current Session Manifest" />
      ) : null}

      {/* Acquisition Status */}
      {acquisitionStatus ? (
        <AcquisitionStatusSection acquisitionStatus={acquisitionStatus} />
      ) : null}

      {/* TERTIARY: Session History (collapsible) */}
      <Collapsible title="Session History" defaultOpen={false}>
        <SessionHistoryTable
          sessions={sessions}
          loading={sessionListLoading}
          onRefresh={refreshSessionList}
        />

        {sessionListError ? (
          <div style={{
            padding: 'var(--space-3)',
            background: 'var(--accent-critical-dim)',
            border: '1px solid var(--accent-critical)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-critical)',
            fontSize: 12,
            marginTop: 'var(--space-3)',
          }}>
            Failed to load session history
          </div>
        ) : null}
      </Collapsible>
    </div>
  )
}
