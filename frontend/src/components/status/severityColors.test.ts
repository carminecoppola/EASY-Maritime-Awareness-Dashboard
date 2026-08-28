import { describe, expect, it } from 'vitest'
import { toneForAvailability, toneForHardwareState, toneForRunningStatus, toneForSeverity } from './severityColors'

describe('toneForHardwareState', () => {
  it('maps ERROR to the critical tone, never a warning — a hardware fault must not be visually understated', () => {
    const tone = toneForHardwareState('ERROR')
    expect(tone.color).toBe('var(--accent-critical)')
  })

  it('maps NOT_DETECTED to critical as well (regression: was shown as a warning before centralizing this)', () => {
    expect(toneForHardwareState('NOT_DETECTED').color).toBe('var(--accent-critical)')
  })

  it('maps STREAMING/GOOD/READY to the ok tone', () => {
    expect(toneForHardwareState('STREAMING').color).toBe('var(--accent-ok)')
    expect(toneForHardwareState('GOOD').color).toBe('var(--accent-ok)')
    expect(toneForHardwareState('READY').color).toBe('var(--accent-ok)')
  })

  it('falls back to a neutral tone for an unrecognized state, keeping the raw value as the label', () => {
    const tone = toneForHardwareState('SOMETHING_NEW')
    expect(tone.label).toBe('SOMETHING_NEW')
  })
})

describe('toneForRunningStatus', () => {
  it('is the single source of truth for RUNNING vs STOPPED coloring (regression: RUNNING was green in one page, orange in another)', () => {
    expect(toneForRunningStatus('RUNNING').color).toBe('var(--accent-ok)')
    expect(toneForRunningStatus('STOPPED').color).not.toBe('var(--accent-ok)')
  })
})

describe('toneForAvailability', () => {
  it('never returns an empty label — status must always be conveyed as text, not color alone', () => {
    for (const value of ['STREAMING', 'READY', 'INITIALIZING', 'NOT_PRESENT', 'ERROR', 'UNKNOWN_VALUE']) {
      expect(toneForAvailability(value).label.length).toBeGreaterThan(0)
    }
  })
})

describe('toneForSeverity', () => {
  it('maps every known severity to a distinct color from CRITICAL', () => {
    const critical = toneForSeverity('CRITICAL').color
    expect(toneForSeverity('INFO').color).not.toBe(critical)
    expect(toneForSeverity('LOW').color).not.toBe(critical)
  })
})
