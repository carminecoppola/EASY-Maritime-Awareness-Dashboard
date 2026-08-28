import { useEffect, useRef, useState } from 'react'
import { formatRelativeTime } from '../../utils/formatTime'
import { useThermalLastFrame, useThermalManualCapture } from '../../hooks/useThermal'

interface ThermalFrameViewerProps {
  enableAutoPolling?: boolean
}

export function ThermalFrameViewer({ enableAutoPolling = true }: ThermalFrameViewerProps) {
  const lastFrame = useThermalLastFrame(2500, enableAutoPolling)
  const manualCapture = useThermalManualCapture()
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date>(new Date())
  // /thermal/last-frame returns 204 (no body) until the first capture ever
  // happens — the on-demand thermal sensor has nothing to serve. The <img>
  // still had a URL to point at, so it rendered the browser's broken-image
  // icon instead of the "no frame yet" placeholder below.
  const [imageFailed, setImageFailed] = useState(false)

  // Track last updated time when frame is fetched
  useEffect(() => {
    if (lastFrame.url) {
      setLastUpdatedTime(new Date())
      setImageFailed(false)
    }
  }, [lastFrame.url])

  useEffect(() => {
    if (manualCapture.url) {
      setImageFailed(false)
    }
  }, [manualCapture.url])

  // Gestisci cooldown dopo manual capture: start AFTER the capture completes (loading becomes false)
  // instead of when it starts, to prevent the button from becoming enabled mid-capture.
  const prevLoadingRef = useRef(false)
  useEffect(() => {
    if (prevLoadingRef.current && !manualCapture.loading) {
      // Transition from loading=true to loading=false: start cooldown
      setCooldownSeconds(2)
    }
    prevLoadingRef.current = manualCapture.loading
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
  const showImage = !!displayUrl && !imageFailed

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
        ) : showImage ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', width: '100%' }}>
            <img
              src={displayUrl}
              alt="Thermal frame"
              onError={() => setImageFailed(true)}
              style={{
                maxWidth: '100%',
                maxHeight: '400px',
                objectFit: 'contain',
              }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Updated {formatRelativeTime(lastUpdatedTime)}
            </div>
          </div>
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
      {/* Distinguishes this from the "Capture Thermal Snapshot" action
          below, which looked identical (same full-width blue button) but
          does something different — this one only previews a frame for a
          few seconds, it does not save anything. */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: -8 }}>
        Previews a live frame for a few seconds — doesn't save it
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
