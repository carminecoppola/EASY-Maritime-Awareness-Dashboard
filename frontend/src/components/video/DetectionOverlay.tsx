import { useEffect, useRef, useState } from 'react'
import type { Detection } from '../../api/types'

interface DetectionOverlayProps {
  detections: Detection[]
  /** Ref del contenitore su cui l'overlay viene sovrapposto (per la misura del ResizeObserver). */
  containerRef?: React.RefObject<HTMLDivElement | null>
  /**
   * Risoluzione nativa del frame a cui si riferiscono le coordinate bbox.
   * Va misurata dal frame reale (es. naturalWidth/naturalHeight dell'<img>
   * che mostra lo stesso stream) — un valore hardcoded ha già causato in
   * passato una scala 2x errata quando differiva dalla risoluzione reale.
   */
  nativeWidth: number
  nativeHeight: number
}

export function DetectionOverlay({ detections, containerRef, nativeWidth, nativeHeight }: DetectionOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const internalContainerRef = useRef<HTMLDivElement>(null)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })

  const container = containerRef || internalContainerRef

  useEffect(() => {
    const element = container.current
    if (!element) return

    // ResizeObserver to measure the displayed container size
    const resizeObserver = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect()
      setDisplaySize({ width: rect.width, height: rect.height })
    })

    resizeObserver.observe(element)

    // Initial measurement
    const rect = element.getBoundingClientRect()
    setDisplaySize({ width: rect.width, height: rect.height })

    return () => resizeObserver.disconnect()
  }, [container])

  // The <img> underneath is rendered with object-fit: cover (see
  // VideoPanel), which scales the native frame UNIFORMLY to fill the
  // container and crops the overflow — it does not stretch width/height
  // independently. The previous version used independent scaleX/scaleY as
  // if object-fit were "fill", which misaligns boxes whenever the
  // container's aspect ratio differs from the native frame's (the common
  // case: a 4:3 container over a 1280x480 stereo frame). Replicate the
  // same "cover" transform here: one uniform scale plus a centering offset
  // for whichever axis gets cropped.
  const coverScale =
    displaySize.width > 0 && displaySize.height > 0
      ? Math.max(displaySize.width / nativeWidth, displaySize.height / nativeHeight)
      : 0
  const renderedWidth = nativeWidth * coverScale
  const renderedHeight = nativeHeight * coverScale
  const offsetX = (displaySize.width - renderedWidth) / 2
  const offsetY = (displaySize.height - renderedHeight) / 2

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      viewBox={`0 0 ${displaySize.width} ${displaySize.height}`}
      preserveAspectRatio="none"
    >
      {detections.map((detection, idx) => {
        // Convert bbox from native to display coordinates via the same
        // uniform-scale-plus-offset transform as object-fit: cover.
        const x1 = offsetX + detection.bbox.x1 * coverScale
        const y1 = offsetY + detection.bbox.y1 * coverScale
        const x2 = offsetX + detection.bbox.x2 * coverScale
        const y2 = offsetY + detection.bbox.y2 * coverScale
        const width = x2 - x1
        const height = y2 - y1

        // Color based on confidence: higher confidence = greener
        const hue = Math.min(detection.confidence * 120, 120) // 0-120 hue range
        const color = `hsl(${hue}, 70%, 50%)`

        return (
          <g key={`${detection.id}-${idx}`}>
            {/* Bounding box rectangle */}
            <rect
              x={x1}
              y={y1}
              width={width}
              height={height}
              fill="none"
              stroke={color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />

            {/* Label background and text */}
            <text
              x={x1}
              y={Math.max(y1 - 4, 12)}
              fill={color}
              fontSize="12"
              fontWeight="bold"
              fontFamily="var(--font-mono)"
              vectorEffect="non-scaling-stroke"
            >
              {detection.class_name} ({(detection.confidence * 100).toFixed(0)}%)
            </text>
          </g>
        )
      })}
    </svg>
  )
}
