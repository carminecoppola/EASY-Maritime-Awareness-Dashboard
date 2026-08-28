export interface Size {
  width: number
  height: number
}

export interface CoverTransform {
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * The uniform scale + centering offset that `object-fit: cover` applies
 * when fitting a `native` frame into a `display` container: the frame is
 * scaled up uniformly until it fully covers the container (the larger of
 * the two axis ratios), then centered, with any overflow on the other axis
 * cropped. Overlay coordinates must go through this same transform to stay
 * aligned with the visible frame — using independent width/height ratios
 * (as if the fit were "fill") misaligns boxes whenever the container's
 * aspect ratio differs from the native frame's, which is the common case
 * here (a 4:3 panel over a 1280x480 stereo frame).
 */
export function computeCoverTransform(display: Size, native: Size): CoverTransform {
  if (display.width <= 0 || display.height <= 0 || native.width <= 0 || native.height <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0 }
  }
  const scale = Math.max(display.width / native.width, display.height / native.height)
  const renderedWidth = native.width * scale
  const renderedHeight = native.height * scale
  return {
    scale,
    offsetX: (display.width - renderedWidth) / 2,
    offsetY: (display.height - renderedHeight) / 2,
  }
}

/** Maps a point in native-frame coordinates to display coordinates. */
export function toDisplayPoint(transform: CoverTransform, x: number, y: number): { x: number; y: number } {
  return { x: transform.offsetX + x * transform.scale, y: transform.offsetY + y * transform.scale }
}
