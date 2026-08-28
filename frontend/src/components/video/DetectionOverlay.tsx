import { useEffect, useRef, useState } from 'react'
import type { Detection } from '../../api/types'

interface DetectionOverlayProps {
  detections: Detection[]
  /** Optional: parent container ref to measure display size. If not provided, will be auto-measured. */
  containerRef?: React.RefObject<HTMLDivElement | null>
  /**
   * Native resolution of the feed.
   * Defaults to 640x480 if not provided (reasonable fallback for maritime feeds).
   */
  nativeWidth?: number
  nativeHeight?: number
  /**
   * Optional: filter detections by source_label to show only relevant ones.
   * If not provided, all detections are shown.
   */
  sourceLabel?: string
}

export function DetectionOverlay({
  detections,
  containerRef,
  nativeWidth = 640,
  nativeHeight = 480,
  sourceLabel,
}: DetectionOverlayProps) {
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

  // Filter detections by sourceLabel if provided
  const filteredDetections = sourceLabel
    ? detections.filter((d) => d.source_label === sourceLabel)
    : detections

  // Calculate scale factors from native to display size
  const scaleX = displaySize.width > 0 ? displaySize.width / nativeWidth : 0
  const scaleY = displaySize.height > 0 ? displaySize.height / nativeHeight : 0

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
      }}
      viewBox={`0 0 ${displaySize.width} ${displaySize.height}`}
      preserveAspectRatio="none"
    >
      {filteredDetections.map((detection, idx) => {
        // Convert bbox from native to display coordinates
        const x1 = detection.bbox.x1 * scaleX
        const y1 = detection.bbox.y1 * scaleY
        const x2 = detection.bbox.x2 * scaleX
        const y2 = detection.bbox.y2 * scaleY
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
