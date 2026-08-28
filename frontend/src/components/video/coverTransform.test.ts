import { describe, expect, it } from 'vitest'
import { computeCoverTransform, toDisplayPoint } from './coverTransform'

describe('computeCoverTransform', () => {
  it('scales a square frame to exactly fill a square container with no offset', () => {
    const t = computeCoverTransform({ width: 400, height: 400 }, { width: 200, height: 200 })
    expect(t.scale).toBe(2)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(0)
  })

  it('crops horizontally (offsetX < 0) for a wide stereo frame in a narrower container (regression case: 1280x480 in a 4:3 panel)', () => {
    // container 300x225 (4:3), native 1280x480 (~2.67:1, much wider)
    const t = computeCoverTransform({ width: 300, height: 225 }, { width: 1280, height: 480 })
    // height-constrained: scale = 225/480
    expect(t.scale).toBeCloseTo(225 / 480, 5)
    expect(t.offsetY).toBe(0)
    expect(t.offsetX).toBeLessThan(0)
    // rendered width = 1280 * scale should exceed the container width, cropped symmetrically
    const renderedWidth = 1280 * t.scale
    expect(t.offsetX).toBeCloseTo((300 - renderedWidth) / 2, 5)
  })

  it('crops vertically (offsetY < 0) for a tall frame in a wider container', () => {
    const t = computeCoverTransform({ width: 400, height: 100 }, { width: 200, height: 400 })
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBeLessThan(0)
  })

  it('returns a zero-scale transform before the container has been measured (width/height 0), instead of dividing by a stale size', () => {
    expect(computeCoverTransform({ width: 0, height: 0 }, { width: 640, height: 480 })).toEqual({
      scale: 0,
      offsetX: 0,
      offsetY: 0,
    })
  })
})

describe('toDisplayPoint', () => {
  it('maps the native origin to the offset, and a native point to offset + point*scale', () => {
    const transform = { scale: 2, offsetX: -100, offsetY: 5 }
    expect(toDisplayPoint(transform, 0, 0)).toEqual({ x: -100, y: 5 })
    expect(toDisplayPoint(transform, 50, 10)).toEqual({ x: 0, y: 25 })
  })

  it('round-trips a bbox through a pure scale-up transform (no crop) back to the expected rendered size', () => {
    const t = computeCoverTransform({ width: 400, height: 400 }, { width: 200, height: 200 })
    const topLeft = toDisplayPoint(t, 10, 10)
    const bottomRight = toDisplayPoint(t, 60, 60)
    expect(bottomRight.x - topLeft.x).toBe(100) // (60-10) native px * scale 2
    expect(bottomRight.y - topLeft.y).toBe(100)
  })
})
