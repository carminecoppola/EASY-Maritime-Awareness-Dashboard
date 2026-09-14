import { useEffect, useState } from 'react'
import { api, withCacheBuster } from '../api/client'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { AnalysisControls } from '../components/analysis/AnalysisControls'
import { DetectionResults } from '../components/analysis/DetectionResults'
import { OperatorErrorAlert } from '../components/feedback/InlineAlert'
import { normalizeApiError, type OperatorError } from '../lib/errors'
import { formatRelativeTime, toDate } from '../utils/formatTime'
import type { InferenceStatus } from '../api/types'

function statusLabel(status: InferenceStatus | null, running: boolean): { text: string; color: string; sub: string } {
  if (running) return { text: 'Running', color: 'var(--accent-info)', sub: 'Processing the latest RGB frame' }
  if (!status) return { text: 'Unknown', color: 'var(--text-muted)', sub: 'Inference status not available' }
  if (status.error) return { text: 'Error', color: 'var(--accent-critical)', sub: status.error }
  if (status.running) return { text: 'Running', color: 'var(--accent-info)', sub: 'Continuous inference is active' }
  return { text: 'Idle', color: 'var(--accent-ok)', sub: 'Waiting for a request' }
}

export function AnalysisPage() {
  // Inference e detection arrivano già dal payload aggregato condiviso: due
  // polling dedicati aggiungevano ~24 richieste al minuto al Raspberry per
  // dati che la dashboard aveva già.
  const dashboard = useSharedDashboardState()

  const [running, setRunning] = useState(false)
  const [runMessage, setRunMessage] = useState<string | null>(null)
  const [runError, setRunError] = useState<OperatorError | null>(null)
  const [previewUrl, setPreviewUrl] = useState(() => withCacheBuster('/api/inference/preview'))
  const [previewMissing, setPreviewMissing] = useState(false)
  const [selectingSourceId, setSelectingSourceId] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)

  const status = (dashboard.data?.inference ?? null) as InferenceStatus | null
  const detectionsPayload = dashboard.data?.detections
  const sources = dashboard.data?.sources?.sources ?? []
  const selectedSourceId = dashboard.data?.sources?.selected_source_id ?? null
  const detectionList = detectionsPayload?.detections ?? []

  // Un 204/404 sull'anteprima non deve restare appiccicato: quando l'URL
  // cambia (nuova esecuzione) si riprova a mostrarla.
  useEffect(() => setPreviewMissing(false), [previewUrl])

  const summary = statusLabel(status, running)
  const lastRun = toDate(status?.last_run_ts)
  const missionDetections = dashboard.data?.detections?.count

  const handleRun = async () => {
    if (running) return
    setRunning(true)
    setRunMessage(null)
    setRunError(null)
    const startedAt = performance.now()
    try {
      const result = await api.runInferenceOnNextFrame()
      const elapsed = performance.now() - startedAt
      setElapsedMs(elapsed)
      if (!result.ok) {
        setRunError({
          severity: 'warning',
          title: 'Inference did not complete',
          message: result.error || 'The device could not analyse the selected frame.',
          retryable: true,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        })
        return
      }
      const count = result.count ?? result.detections?.length ?? 0
      setRunMessage(`${count} detection${count === 1 ? '' : 's'} · ${(elapsed / 1000).toFixed(2)} s end-to-end`)
      // Il preview è riscritto dal backend a ogni run: forza un nuovo URL,
      // altrimenti il browser mostra il frame precedente dalla cache.
      setPreviewMissing(false)
      setPreviewUrl(withCacheBuster('/api/inference/preview'))
    } catch (e) {
      setRunError(normalizeApiError(e, 'inference'))
    } finally {
      setRunning(false)
    }
  }

  const handleSelectSource = async (sourceId: string) => {
    if (selectingSourceId) return
    setSelectingSourceId(sourceId)
    setRunError(null)
    try {
      await api.selectSource(sourceId)
    } catch (e) {
      setRunError(normalizeApiError(e, 'source-selection'))
    } finally {
      setSelectingSourceId(null)
    }
  }

  const modelName = status?.model_path ? status.model_path.split('/').pop() : null

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Object detection</div>
          <h1>AI Analysis</h1>
          <p>Run and review RGB maritime object detection.</p>
        </div>
        <div className="easy-updated">
          Inference service <b>{dashboard.error ? 'unreachable' : summary.text.toLowerCase()}</b>
        </div>
      </section>

      <section className="easy-readiness" aria-label="Inference summary">
        <div className="easy-readycell">
          <div className="easy-kicker">Inference status</div>
          <div className="easy-value" style={{ color: summary.color }}>
            {summary.text}
          </div>
          <div className="easy-sub">{summary.sub}</div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Model</div>
          <div className="easy-value mono" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
            {modelName ?? 'Unavailable'}
          </div>
          <div className="easy-sub">
            {status?.backend ? `${status.backend} runtime` : 'Runtime unknown'}
            {status?.backend_status?.loaded === false ? ' · not loaded' : ''}
          </div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Last inference</div>
          <div className="easy-value mono">
            {typeof status?.last_inference_ms === 'number' ? `${status.last_inference_ms.toFixed(0)} ms` : '—'}
          </div>
          <div className="easy-sub">{lastRun ? formatRelativeTime(lastRun) : 'No run recorded'}</div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Mission detections</div>
          <div className="easy-value mono">{typeof missionDetections === 'number' ? missionDetections : '—'}</div>
          <div className="easy-sub">In the latest result</div>
        </div>
      </section>

      <section className="easy-workspace">
        <article className="easy-surface">
          <div className="easy-panelhead">
            <h2>Inference preview</h2>
            <span className="easy-panelnote">{status?.source_label ?? 'Source unknown'}</span>
          </div>
          <div className="easy-preview">
            {previewMissing ? (
              <p className="easy-preview-empty">
                No inference preview yet. Run analysis to generate one.
              </p>
            ) : (
              <img
                src={previewUrl}
                alt="Latest inference preview with detection boxes"
                onError={() => setPreviewMissing(true)}
              />
            )}
            <div className="easy-preview-scrim" aria-hidden />
            {running && <div className="easy-scan" aria-hidden />}

            <div className="easy-over top">
              <span className={`easy-badge${running ? '' : ' idle'}`}>
                {running ? 'ANALYZING' : 'LAST RESULT'}
              </span>
              {status?.source_status && <span className="easy-mono">{status.source_status}</span>}
            </div>
            <div className="easy-over bottom">
              <span>
                {status?.last_image ? status.last_image.split('/').pop() : 'No source frame recorded'}
              </span>
              <span className="easy-mono">
                {runError
                  ? 'Run failed'
                  : detectionList.length > 0
                    ? `${detectionList.length} detection${detectionList.length === 1 ? '' : 's'}`
                    : 'No active result'}
              </span>
            </div>
          </div>
        </article>

        <AnalysisControls
          sources={sources}
          selectedSourceId={selectedSourceId}
          onSelectSource={handleSelectSource}
          selectingSourceId={selectingSourceId}
          status={status}
          onRun={handleRun}
          running={running}
          runMessage={runMessage}
          disabledReason={
            status?.backend_status?.loaded === false && status?.config_error
              ? 'The detection model reported a configuration error.'
              : null
          }
        />
      </section>

      {runError && <OperatorErrorAlert error={runError} onRetry={handleRun} retrying={running} />}

      <section className="easy-lowergrid">
        <DetectionResults
          detections={detectionList}
          meta={
            detectionsPayload?.updated_at
              ? `Updated ${formatRelativeTime(detectionsPayload.updated_at)}`
              : 'No completed inference'
          }
          loading={dashboard.loading}
          error={dashboard.error ? 'Detection results unavailable — the device could not be reached.' : null}
        />

        <aside className="easy-surface">
          <div className="easy-panelhead">
            <h2>Inference performance</h2>
          </div>
          <div className="easy-controls">
            <div className="easy-tiles">
              <div className="easy-tile">
                <b>{typeof status?.last_inference_ms === 'number' ? `${status.last_inference_ms.toFixed(0)} ms` : '—'}</b>
                <span>Backend time</span>
              </div>
              <div className="easy-tile">
                <b>{elapsedMs !== null ? `${(elapsedMs / 1000).toFixed(2)} s` : '—'}</b>
                <span>End-to-end (this session)</span>
              </div>
              <div className="easy-tile">
                <b>{typeof status?.fps === 'number' ? status.fps.toFixed(2) : '—'}</b>
                <span>Frames per second</span>
              </div>
              <div className="easy-tile">
                <b>{status?.backend_status?.cpu_threads ? `CPU ×${status.backend_status.cpu_threads}` : 'CPU'}</b>
                <span>Execution provider</span>
              </div>
            </div>
            <p className="easy-note-small">
              Thermal is excluded because the deployed weights accept RGB input only.
            </p>
          </div>
        </aside>
      </section>
    </>
  )
}
