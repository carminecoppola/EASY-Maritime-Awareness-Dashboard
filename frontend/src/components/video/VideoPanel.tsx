/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * One live RGB feed: MJPEG image, detection overlay, status chips and capture/expand actions.
 */

import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { toDate } from '../../utils/formatTime'
import { DetectionOverlay } from './DetectionOverlay'
import type { Availability, Detection } from '../../api/types'

interface VideoPanelProps {
  feed: 'rgb_left' | 'rgb_right'
  label: string
  availability: Availability
  /**
   * Current detections to draw as an overlay. The backend offers no reliable way
   * today to attribute a detection to rgb_left or rgb_right (source_label
   * reflects the frame provider source, e.g. "Replay Folder", not the physical
   * side), so the same detections are shown on both panels until the backend
   * exposes a per-side attribution.
   */
  detections?: Detection[]
  /** Real camera FPS (health.cameras.rgb_cameras); omitted when absent. */
  fps?: number | null
  /** Last acquisition reported by the camera: epoch seconds or ISO. */
  lastAcquisitionTs?: number | string | null
  /** Camera error message, shown in the unavailable state. */
  cameraError?: string | null
}

/** Operator-facing explanation of each non-streaming availability. */
const AVAILABILITY_REASON: Record<Availability, string> = {
  STREAMING: '',
  READY: 'Camera ready but not streaming',
  INITIALIZING: 'Camera is starting up',
  NOT_PRESENT: 'Device not present',
  ERROR: 'Camera reported an error',
}

/** Feed card for `rgb_left` or `rgb_right`; falls back to an explanatory placeholder when the stream is not available. */
export function VideoPanel({
  feed,
  label,
  availability,
  detections = [],
  fps,
  lastAcquisitionTs,
  cameraError,
}: VideoPanelProps) {
  const [imageError, setImageError] = useState(false)
  const cardRef = useRef<HTMLElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureMessage, setCaptureMessage] = useState<string | null>(null)

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageError(false)
    // Measure the native resolution from the served image instead of assuming a
    // fixed one: this removes the bounding-box misalignment when the real
    // resolution differs from a hardcoded value (it happened: 640x480 assumed vs
    // 1280x480 real).
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }

  const handleCapture = async () => {
    if (capturing) return
    setCapturing(true)
    setCaptureMessage(null)
    try {
      await api.takeSnapshot(feed)
      setCaptureMessage('Captured')
    } catch (e) {
      setCaptureMessage(e instanceof Error ? `Capture failed: ${e.message}` : 'Capture failed')
    } finally {
      setCapturing(false)
    }
  }

  const handleExpand = () => {
    const node = cardRef.current
    if (!node) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      node.requestFullscreen?.()
    }
  }

  const streaming = availability === 'STREAMING'
  const showFeed = !(imageError || availability === 'ERROR' || availability === 'NOT_PRESENT')

  // last_acquisition_ts is an epoch in seconds (time.time()): passing it straight
  // to new Date() showed a 1970 time as the "last frame".
  const lastFrameAt = toDate(lastAcquisitionTs)
  const frameInfo = captureMessage
    ? captureMessage
    : lastFrameAt
      ? `Last frame ${lastFrameAt.toLocaleTimeString(undefined, { hour12: false })}`
      : streaming
        ? 'Streaming'
        : AVAILABILITY_REASON[availability] || availability

  return (
    <article ref={cardRef} className={`easy-feed${streaming ? ' streaming' : ''}`}>
      <div className="easy-feed-media" ref={mediaRef}>
        {showFeed ? (
          <>
            <img src={`/video/${feed}`} alt={`${label} camera feed`} onError={() => setImageError(true)} onLoad={handleLoad} />
            {naturalSize && detections.length > 0 && (
              <DetectionOverlay
                detections={detections}
                containerRef={mediaRef}
                nativeWidth={naturalSize.width}
                nativeHeight={naturalSize.height}
              />
            )}
          </>
        ) : (
          <div className="easy-feed-empty">
            <p style={{ margin: 0 }}>Feed unavailable</p>
            <p style={{ margin: 0, fontSize: 11 }}>
              {cameraError || (imageError ? 'Unable to load the stream' : AVAILABILITY_REASON[availability] || availability)}
            </p>
          </div>
        )}
      </div>

      <div className="easy-feed-scrim" aria-hidden />

      <div className="easy-feedtop">
        <span className="easy-feedname">{label}</span>
        {streaming ? (
          <span className="easy-live">LIVE</span>
        ) : (
          <span className="easy-chip">{availability.replace('_', ' ')}</span>
        )}
        <div className="easy-telemetry">
          {typeof fps === 'number' && <span className="easy-chip">{fps.toFixed(1)} FPS</span>}
        </div>
      </div>

      <div className="easy-feedbottom">
        <span className="easy-frameinfo">{frameInfo}</span>
        <div className="easy-feedbuttons">
          <button type="button" className="easy-ghost" onClick={handleCapture} disabled={capturing || !showFeed}>
            {capturing ? 'Capturing…' : 'Capture'}
          </button>
          <button type="button" className="easy-ghost" onClick={handleExpand}>
            Expand
          </button>
        </div>
      </div>
    </article>
  )
}
