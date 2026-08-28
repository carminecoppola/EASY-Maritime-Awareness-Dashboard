import { useCallback, useState } from 'react'
import { api } from '../../api/client'

interface DatasetExportProps {}

type ExportPhase = 'idle' | 'validating' | 'validation-done' | 'exporting' | 'export-done'

export function DatasetExport({}: DatasetExportProps) {
  const [phase, setPhase] = useState<ExportPhase>('idle')
  const [validationResult, setValidationResult] = useState<unknown>(null)
  const [sessionId, setSessionId] = useState('')
  const [validationPercent, setValidationPercent] = useState(100)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportStatusUrl, setExportStatusUrl] = useState<string | null>(null)

  const handleValidate = useCallback(async () => {
    setPhase('validating')
    setValidationResult(null)
    setExportError(null)
    try {
      const result = await api.validateDataset(sessionId || undefined)
      setValidationResult(result)
      setPhase('validation-done')
    } catch (e) {
      setExportError(`Validation failed: ${e instanceof Error ? e.message : String(e)}`)
      setPhase('idle')
    }
  }, [sessionId])

  const handleExport = useCallback(async () => {
    setPhase('exporting')
    setExportError(null)
    try {
      // POST /api/dataset/export is synchronous (verified against
      // easy_dashboard/routes/api_inference.py + dataset_exporter.py: it
      // copies every file and builds the archive before responding) — by
      // the time this resolves the export already exists on disk. The
      // previous code polled /api/dataset/export/status afterwards to
      // "wait" for completion, but that endpoint always returns 200
      // regardless of state, so it looked like it worked while actually
      // just declaring success on the very first tick; it also never
      // cleared its interval on unmount, leaking a timer + a post-unmount
      // setState whenever the operator navigated away mid-export.
      await api.exportDataset({
        session_id: sessionId || undefined,
        validation_percent: validationPercent,
      })
      setPhase('export-done')
      setExportStatusUrl('/api/dataset/export/download')
    } catch (e) {
      setExportError(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
      setPhase('idle')
    }
  }, [sessionId, validationPercent])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Dataset Export</div>

      {/* Sezione Validazione */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>1. Validate Dataset</div>
        <button
          onClick={handleValidate}
          disabled={phase === 'validating'}
          style={{
            padding: '8px 12px',
            background: 'var(--accent-interactive)',
            color: 'var(--bg-0)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            fontWeight: 600,
            cursor: phase === 'validating' ? 'not-allowed' : 'pointer',
            transition: 'background 150ms ease-out',
          }}
          onMouseEnter={(e) => {
            if (phase !== 'validating') {
              e.currentTarget.style.background = 'var(--accent-interactive-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (phase !== 'validating') {
              e.currentTarget.style.background = 'var(--accent-interactive)'
            }
          }}
        >
          {phase === 'validating' ? 'Validating...' : 'Validate Dataset'}
        </button>

        {validationResult ? (
          <div
            style={{
              padding: 'var(--space-2)',
              background: 'var(--bg-3)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            <pre style={{ margin: 0, overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
              {JSON.stringify(validationResult as unknown, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>

      {/* Sezione Export */}
      {phase !== 'idle' && phase !== 'validating' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>2. Export Dataset</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Session ID (optional)
              </label>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                disabled={phase === 'exporting' || phase === 'export-done'}
                placeholder="e.g. session-20260828-000300"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Validation Percent: {validationPercent}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={validationPercent}
                onChange={(e) => setValidationPercent(parseInt(e.target.value))}
                disabled={phase === 'exporting' || phase === 'export-done'}
                style={{
                  width: '100%',
                }}
              />
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={phase === 'exporting' || phase === 'export-done'}
            style={{
              padding: '8px 12px',
              background: phase === 'export-done' ? 'var(--accent-ok)' : 'var(--accent-interactive)',
              color: 'var(--bg-0)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              fontWeight: 600,
              cursor:
                phase === 'exporting' || phase === 'export-done' ? 'not-allowed' : 'pointer',
              transition: 'background 150ms ease-out',
            }}
            onMouseEnter={(e) => {
              if (phase !== 'exporting' && phase !== 'export-done') {
                e.currentTarget.style.background = 'var(--accent-interactive-hover)'
              }
            }}
            onMouseLeave={(e) => {
              if (phase !== 'exporting' && phase !== 'export-done') {
                e.currentTarget.style.background = 'var(--accent-interactive)'
              }
            }}
          >
            {phase === 'exporting'
              ? 'Exporting...'
              : phase === 'export-done'
                ? 'Export complete'
                : 'Export Dataset'}
          </button>

          {phase === 'export-done' && exportStatusUrl && (
            <a
              href={exportStatusUrl}
              download
              style={{
                padding: '8px 12px',
                background: 'var(--accent-ok)',
                color: 'var(--bg-0)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'background 150ms ease-out',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(0.9)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none'
              }}
            >
              Download Exported Dataset
            </a>
          )}
        </div>
      )}

      {exportError && (
        <div
          style={{
            padding: 'var(--space-2)',
            background: 'var(--accent-critical-dim)',
            border: `1px solid var(--accent-critical)`,
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--accent-critical)',
          }}
        >
          {exportError}
        </div>
      )}
    </div>
  )
}
