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
    expect((plain.firstChild as HTMLElement).style.border).toContain('1px')
    expect((emphasized.firstChild as HTMLElement).style.border).toContain('2px')
  })

  it('honors the gap override (regression: DatasetExport needed space-4, Panel defaulted to space-3)', () => {
    const { container } = render(<Panel gap="space-4">x</Panel>)
    expect((container.firstChild as HTMLElement).style.gap).toBe('var(--space-4)')
  })
})
