/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * SVG overlay that draws detection boxes on top of a video feed.
 *
 * Box coordinates are in the native frame resolution; they are mapped to the
 * displayed size with the same transform as `object-fit: cover`.
 */

import { useEffect, useRef, useState } from 'react'
import type { Detection } from '../../api/types'
import { computeCoverTransform, toDisplayPoint } from './coverTransform'

interface DetectionOverlayProps {
  detections: Detection[]
  /** Ref of the container the overlay sits on (measured with a ResizeObserver). */
  containerRef?: React.RefObject<HTMLDivElement | null>
  /**
   * Native resolution of the frame the bbox coordinates refer to. It must be
   * measured from the real frame (e.g. naturalWidth/naturalHeight of the <img>
   * showing the same stream): a hardcoded value once caused a wrong 2x scale when
   * it differed from the real resolution.
   */
  nativeWidth: number
  nativeHeight: number
}

/** Draws each detection as a rectangle with a `class (confidence%)` label, greener for higher confidence. */
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
  // VideoPanel) — see coverTransform.ts for why this can't use independent
  // scaleX/scaleY.
  const transform = computeCoverTransform(displaySize, { width: nativeWidth, height: nativeHeight })

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
      {detections.map((detection) => {
        // Convert bbox from native to display coordinates via the same
        // uniform-scale-plus-offset transform as object-fit: cover.
        const { x: x1, y: y1 } = toDisplayPoint(transform, detection.bbox.x1, detection.bbox.y1)
        const { x: x2, y: y2 } = toDisplayPoint(transform, detection.bbox.x2, detection.bbox.y2)
        const width = x2 - x1
        const height = y2 - y1

        // Color based on confidence: higher confidence = greener
        const hue = Math.min(detection.confidence * 120, 120) // 0-120 hue range
        const color = `hsl(${hue}, 70%, 50%)`

        return (
          <g key={detection.id}>
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
