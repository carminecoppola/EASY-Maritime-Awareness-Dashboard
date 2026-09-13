import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Panel } from './Panel'

describe('Panel', () => {
  it('renders its children', () => {
    render(<Panel>content</Panel>)
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('uses the thicker emphasis border only when asked — the visual cue for "this is the primary panel on the page"', () => {
    const { container: plain } = render(<Panel>x</Panel>)
    const { container: emphasized } = render(<Panel emphasis>x</Panel>)
    expect((plain.firstChild as HTMLElement).style.borderRight).toContain('1px')
    // L'emphasis mette un filo d'accento sul solo lato superiore (brand
    // color) — i quattro lati non sono più uniformi, li controlliamo
    // separatamente invece di affidarci allo shorthand `border`.
    expect((emphasized.firstChild as HTMLElement).style.borderRight).toContain('2px')
    expect((emphasized.firstChild as HTMLElement).style.borderTop).toContain('var(--accent-brand)')
  })

  it('honors the gap override (regression: DatasetExport needed space-4, Panel defaulted to space-3)', () => {
    const { container } = render(<Panel gap="space-4">x</Panel>)
    expect((container.firstChild as HTMLElement).style.gap).toBe('var(--space-4)')
  })
})
