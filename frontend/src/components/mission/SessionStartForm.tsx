import { useId, useState } from 'react'
import { api } from '../../api/client'
import { normalizeApiError } from '../../lib/errors'

interface SessionStartFormProps {
  onSessionChanged: () => void
  /** Modello di inferenza registrato nel manifest della sessione. */
  modelLabel: string
  /** Impedisce l'avvio quando un controllo di preflight è bloccante. */
  blockedReason?: string | null
}

const MODES: { value: string; title: string; description: string }[] = [
  {
    value: 'live',
    title: 'Live acquisition',
    description: 'Use the connected RGB and thermal sensors.',
  },
  {
    value: 'replay',
    title: 'Replay — single image',
    description: 'Replay one recorded image, for testing without hardware.',
  },
  {
    value: 'replay_folder',
    title: 'Replay — folder',
    description: 'Replay a folder of recorded images in sequence.',
  },
]

export function SessionStartForm({ onSessionChanged, modelLabel, blockedReason }: SessionStartFormProps) {
  const [mode, setMode] = useState('live')
  const [operator, setOperator] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operatorId = useId()
  const notesId = useId()

  const handleStart = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      await api.startSession({
        mode: mode || undefined,
        operator: operator || undefined,
        notes: notes || undefined,
      })
      setMode('live')
      setOperator('')
      setNotes('')
      onSessionChanged()
    } catch (e) {
      setError(normalizeApiError(e, 'session-start').message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="easy-panel">
      <div className="easy-panelhead plain">
        <div>
          <h2>Configure mission</h2>
          <p>Create the session that links captures, detections and events.</p>
        </div>
        <span className="easy-step" aria-hidden>
          1
        </span>
      </div>

      <div className="easy-formgrid">
        <div className="easy-field">
          <label htmlFor={operatorId}>Operator</label>
          <input
            id={operatorId}
            className="easy-input"
            type="text"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            disabled={loading}
            placeholder="Operator name"
          />
          <div className="easy-hint">Recorded in the mission manifest. Defaults to “operator” if left empty.</div>
        </div>

        <div className="easy-field">
          {/* Il nome missione non esiste nel contratto backend: l'identificativo
              è generato all'avvio. Qui si mostra il modello realmente registrato. */}
          <span className="easy-fieldlabel">Detection model</span>
          <div className="easy-readonly" title={modelLabel}>
            {modelLabel}
          </div>
          <div className="easy-hint">The mission identifier is assigned by the backend when it starts.</div>
        </div>

        <div className="easy-field full">
          <span className="easy-fieldlabel" id={`${operatorId}-mode`}>
            Acquisition mode
          </span>
          <div className="easy-modecards" role="radiogroup" aria-labelledby={`${operatorId}-mode`}>
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                className="easy-mode"
                onClick={() => setMode(option.value)}
                disabled={loading}
              >
                <span className="easy-radio" aria-hidden />
                <b>{option.title}</b>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="easy-field full">
          <label htmlFor={notesId}>
            Mission notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· optional</span>
          </label>
          <textarea
            id={notesId}
            className="easy-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={loading}
          />
          <div className="easy-hint">Notes remain attached to the mission manifest and the exported dataset.</div>
        </div>
      </div>

      {error && <p className="easy-error">{error}</p>}

      <div className="easy-formfooter">
        <span className="easy-note">
          Starting a mission does not automatically save frames. Use synchronized capture during the session.
        </span>
        <button
          type="button"
          className="easy-btn primary"
          onClick={handleStart}
          disabled={loading || Boolean(blockedReason)}
          title={blockedReason ?? undefined}
        >
          {loading ? 'Starting…' : 'Start mission'}
        </button>
      </div>
      {blockedReason && <p className="easy-empty">{blockedReason}</p>}
    </article>
  )
}
