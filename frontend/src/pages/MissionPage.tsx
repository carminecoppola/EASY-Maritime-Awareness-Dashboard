import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { useSessionList } from '../hooks/useSessionList'
import { SessionStartForm } from '../components/mission/SessionStartForm'
import { SessionHistoryTable } from '../components/mission/SessionHistoryTable'
import { ActiveMissionPanel } from '../components/mission/ActiveMissionPanel'
import { PreflightChecklist } from '../components/mission/PreflightChecklist'
import { Collapsible } from '../components/common/Collapsible'
import { AcquisitionStatusSection } from '../components/mission/AcquisitionStatusSection'
import { CHECK_COLOR, preflightChecks, preflightSummary } from '../lib/preflight'
import { sensorReadiness } from '../lib/readiness'
import { formatRelativeTime, toDate } from '../utils/formatTime'
import type { SessionManifestCounts } from '../api/types'

function modelLabelFrom(inference: unknown): string {
  const payload = inference as { model_path?: string; backend?: string } | undefined
  const path = payload?.model_path
  if (!path) return 'Model unavailable'
  const name = path.split('/').pop() || path
  return payload?.backend ? `${name} · ${payload.backend}` : name
}

export function MissionPage(): ReactNode {
  const dashboard = useSharedDashboardState()
  const { sessions, loading: sessionListLoading, refresh: refreshSessionList, error: sessionListError } = useSessionList()
  const [currentManifest, setCurrentManifest] = useState<SessionManifestCounts | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Una risposta di polling partita PRIMA dello stop può arrivare dopo e
  // rimettere running=true: il pannello sarebbe tornato indietro, perdendo i
  // propri messaggi. Si tiene lo stato locale finché il backend concorda.
  const [pendingStop, setPendingStop] = useState(false)

  const data = dashboard.data
  const dashboardSession = data?.session
  const currentSession = dashboardSession?.current ?? null
  const backendRunning = dashboardSession?.running ?? false
  const isRunning = backendRunning && !pendingStop
  const sessionId = currentSession?.session_id ?? null

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const loadCurrentManifest = useCallback(async () => {
    if (!sessionId) {
      setCurrentManifest(null)
      return
    }
    try {
      const manifest = await api.getSessionManifest(sessionId)
      setCurrentManifest(manifest.counts)
    } catch (e) {
      console.error('Failed to load current session manifest:', e)
    }
  }, [sessionId])

  // Carica il manifest anche all'apertura della pagina se una missione è già
  // attiva, non solo dopo uno start/stop.
  useEffect(() => {
    loadCurrentManifest()
  }, [loadCurrentManifest])

  const handleSessionChanged = useCallback(async () => {
    await Promise.all([loadCurrentManifest(), refreshSessionList()])
  }, [loadCurrentManifest, refreshSessionList])

  const handleStopped = useCallback(async () => {
    setPendingStop(true)
    await handleSessionChanged()
  }, [handleSessionChanged])

  // Appena il backend conferma, l'override locale si azzera.
  useEffect(() => {
    if (!backendRunning) setPendingStop(false)
  }, [backendRunning])

  const sensors = sensorReadiness(data ?? null)
  const checks = preflightChecks(data ?? null)
  const summary = preflightSummary(checks)
  const rgbOnline = sensors.slice(0, 2).filter((s) => s.ready).length
  const thermal = sensors[2]
  const disk = data?.health?.system?.disk
  const lastUpdate = toDate(data?.timestamp)

  // Il manifest live del backend è la fonte per i contatori durante la
  // missione; il manifest caricato a parte copre il caso in cui il payload
  // aggregato non lo includa ancora.
  const liveCounts = (data?.acquisition?.manifest_counts as SessionManifestCounts | undefined) ?? currentManifest

  const blockedReason =
    summary.level === 'fail'
      ? 'A blocking preflight check must be resolved before starting a mission.'
      : summary.level === 'unknown'
        ? 'Waiting for the system status before a mission can be started.'
        : null

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Acquisition workflow</div>
          <h1>Mission Control</h1>
          <p>Prepare, start and monitor a coordinated acquisition session.</p>
        </div>
        <div className="easy-updated">
          {dashboard.error ? (
            <>
              Connection lost — checks from <b>{lastUpdate ? formatRelativeTime(lastUpdate) : 'unknown'}</b>
            </>
          ) : (
            <>
              System checked <b>{lastUpdate ? formatRelativeTime(lastUpdate) : 'unknown'}</b>
            </>
          )}
        </div>
      </section>

      <section className="easy-readiness" aria-label="Mission readiness">
        <div className="easy-readycell">
          <div className="easy-kicker">Preflight</div>
          <div className="easy-value" style={{ color: CHECK_COLOR[summary.level] }}>
            {summary.label}
          </div>
          <div className="easy-sub">{summary.detail}</div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">RGB cameras</div>
          <div className="easy-value">{rgbOnline} / 2 online</div>
          <div className="easy-sub">{rgbOnline === 2 ? 'Frames current' : 'Check the live feeds'}</div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Thermal</div>
          <div className="easy-value">{thermal.ready ? 'Ready' : thermal.availability.replace('_', ' ')}</div>
          <div className="easy-sub">On-demand capture</div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Available storage</div>
          <div className="easy-value">{disk ? `${disk.free_gb.toFixed(1)} GB` : 'Unavailable'}</div>
          <div className="easy-sub">
            {disk ? `${(100 - disk.percent).toFixed(0)}% of ${disk.total_gb.toFixed(0)} GB free` : 'Disk usage not reported'}
          </div>
        </div>
      </section>

      <section className="easy-mission-layout">
        {isRunning ? (
          <ActiveMissionPanel
            session={currentSession}
            counts={liveCounts ?? null}
            sensorsReady={sensors.filter((s) => s.ready).length}
            sensorsTotal={sensors.length}
            now={now}
            onChanged={handleSessionChanged}
            onStopped={handleStopped}
          />
        ) : (
          <SessionStartForm
            onSessionChanged={handleSessionChanged}
            modelLabel={modelLabelFrom(data?.inference)}
            blockedReason={blockedReason}
          />
        )}

        <PreflightChecklist checks={checks} />
      </section>

      <SessionHistoryTable
        sessions={sessions}
        loading={sessionListLoading}
        error={sessionListError}
        onRefresh={refreshSessionList}
      />

      {data?.acquisition ? (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Collapsible title="Acquisition details" defaultOpen={false}>
            <AcquisitionStatusSection acquisitionStatus={data.acquisition} />
          </Collapsible>
        </div>
      ) : null}
    </>
  )
}
