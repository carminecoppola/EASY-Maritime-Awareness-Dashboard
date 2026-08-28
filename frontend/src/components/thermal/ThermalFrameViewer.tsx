import { useEffect, useState } from 'react'
import { useThermalLastFrame, useThermalManualCapture } from '../../hooks/useThermal'

interface ThermalFrameViewerProps {
  enableAutoPolling?: boolean
}

export function ThermalFrameViewer({ enableAutoPolling = true }: ThermalFrameViewerProps) {
  const lastFrame = useThermalLastFrame(2500, enableAutoPolling)
  const manualCapture = useThermalManualCapture()
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  // Gestisci cooldown dopo manual capture
  useEffect(() => {
    if (manualCapture.loading) {
      setCooldownSeconds(2)
    }
  }, [manualCapture.loading])

  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setTimeout(() => {
      setCooldownSeconds((s) => s - 1)
    }, 1000)
    return () => clearTimeout(timer)
  }, [cooldownSeconds])

  const displayUrl = manualCapture.url || lastFrame.url
  const isLoading = manualCapture.loading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Frame Viewer */}
      <div
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          gap: 'var(--space-3)',
        }}
      >
        {isLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Capturing thermal frame...
          </div>
        ) : displayUrl ? (
          <img
            src={displayUrl}
            alt="Thermal frame"
            style={{
              maxWidth: '100%',
              maxHeight: '400px',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No thermal frame available
            <br />
            <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              Click "Capture Now" to acquire the first frame
            </span>
          </div>
        )}
      </div>

      {/* Bottone Aggiorna Ora */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          onClick={() => manualCapture.capture()}
          disabled={isLoading || cooldownSeconds > 0}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: isLoading || cooldownSeconds > 0 ? 'var(--accent-warn)' : 'var(--accent-interactive)',
            color: 'var(--bg-0)',
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: isLoading || cooldownSeconds > 0 ? 'not-allowed' : 'pointer',
            transition: 'background 150ms ease-out',
          }}
          onMouseEnter={(e) => {
            if (!isLoading && cooldownSeconds === 0) {
              e.currentTarget.style.background = 'var(--accent-interactive-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading && cooldownSeconds === 0) {
              e.currentTarget.style.background = 'var(--accent-interactive)'
            }
          }}
        >
          {isLoading
            ? 'Capturing...'
            : cooldownSeconds > 0
              ? `Capture Now (${cooldownSeconds}s)`
              : 'Capture Now'}
        </button>
      </div>

      {manualCapture.error ? (
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
          Error: {manualCapture.error instanceof Error ? manualCapture.error.message : String(manualCapture.error as unknown)}
        </div>
      ) : null}
    </div>
  )
}
