import type { InferenceStatus, SourceInfo } from '../../api/types'

interface AnalysisControlsProps {
  sources: SourceInfo[]
  selectedSourceId: string | null
  onSelectSource: (sourceId: string) => void
  selectingSourceId: string | null
  status: InferenceStatus | null
  onRun: () => void
  running: boolean
  runMessage: string | null
  disabledReason: string | null
}

function sourceInitial(source: SourceInfo): string {
  const label = String(source.name ?? source.id ?? '?')
  if (/left/i.test(label)) return 'L'
  if (/right/i.test(label)) return 'R'
  if (/replay/i.test(label)) return '↻'
  return label.slice(0, 1).toUpperCase()
}

export function AnalysisControls({
  sources,
  selectedSourceId,
  onSelectSource,
  selectingSourceId,
  status,
  onRun,
  running,
  runMessage,
  disabledReason,
}: AnalysisControlsProps) {
  const modelName = status?.model_path ? status.model_path.split('/').pop() : null
  const loaded = status?.backend_status?.loaded
  const threads = status?.backend_status?.cpu_threads

  return (
    <aside className="easy-surface">
      <div className="easy-panelhead">
        <h2>Analysis controls</h2>
        <span className="easy-panelnote">RGB only</span>
      </div>

      <div className="easy-controls">
        <div className="easy-block">
          <div className="easy-blocktitle">
            <b>Source</b>
            <span>Choose one input</span>
          </div>
          {sources.length === 0 ? (
            <p className="easy-empty" style={{ marginTop: 0 }}>
              No source reported by the backend.
            </p>
          ) : (
            <div className="easy-sources" role="radiogroup" aria-label="Inference source">
              {sources.map((source) => {
                const id = String(source.id)
                // Il campo reale è `name` ("RGB LEFT"), non `label`: con
                // `label` ogni sorgente mostrava il proprio id grezzo.
                const label = String((source as Record<string, unknown>).name ?? id)
                const sourceStatus = String((source as Record<string, unknown>).status ?? '')
                // I pesi ONNX distribuiti accettano solo RGB: il termico non
                // va offerto come sorgente compatibile.
                const rgbIncompatible = /thermal/i.test(`${id} ${label}`)
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selectedSourceId === id}
                    tabIndex={selectedSourceId === id ? 0 : -1}
                    className="easy-source"
                    onClick={() => onSelectSource(id)}
                    disabled={Boolean(selectingSourceId) || rgbIncompatible}
                    title={rgbIncompatible ? 'The deployed model accepts RGB input only' : undefined}
                  >
                    <i aria-hidden>{sourceInitial(source)}</i>
                    <div>
                      <b>{label}</b>
                      <small>
                        {rgbIncompatible
                          ? 'Not compatible — RGB-only model'
                          : selectingSourceId === id
                            ? 'Switching…'
                            : sourceStatus || id}
                      </small>
                    </div>
                    <span className="easy-radio" aria-hidden />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="easy-block">
          <div className="easy-blocktitle">
            <b>Detection model</b>
            <span>{status?.mode ? `mode ${status.mode}` : ''}</span>
          </div>
          <div className="easy-model">
            <span className="easy-model-mark" aria-hidden>
              AI
            </span>
            <div>
              <b className="mono">{modelName ?? 'Model unavailable'}</b>
              <small>{status?.backend ? `${status.backend} runtime` : 'Runtime unknown'}</small>
            </div>
            <span
              className="easy-tag"
              style={{ color: loaded ? 'var(--accent-ok)' : loaded === false ? 'var(--accent-warn)' : 'var(--text-muted)' }}
            >
              {/* undefined non è "non caricato": è "non sappiamo". */}
              {loaded === undefined ? 'UNKNOWN' : loaded ? 'LOADED' : 'NOT LOADED'}
            </span>
          </div>
          {typeof threads === 'number' && (
            <p className="easy-note-small">
              Execution on CPU · {threads} threads
              {status?.backend_status?.execution_mode ? ` · ${status.backend_status.execution_mode}` : ''}
            </p>
          )}
          {status?.config_error ? <p className="easy-error">{status.config_error}</p> : null}
        </div>

        <div className="easy-block">
          <button
            type="button"
            className="easy-btn primary easy-run"
            onClick={onRun}
            disabled={running || Boolean(disabledReason)}
            title={disabledReason ?? undefined}
          >
            {running ? 'Analyzing frame…' : 'Run analysis'}
          </button>
          <p className="easy-runtext">
            {disabledReason ?? runMessage ?? 'Uses the next frame from the selected source'}
          </p>
        </div>
      </div>
    </aside>
  )
}
