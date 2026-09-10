import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionHeader } from './SectionHeader'

describe('SectionHeader', () => {
  it('renders the title as an h2 by default', () => {
    render(<SectionHeader title="Status Summary" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Status Summary' })).toBeInTheDocument()
  })

  it('renders as an h3 when level=3 is given (sub-section headers, e.g. Devices/Sources inventory)', () => {
    render(<SectionHeader title="Devices (4)" level={3} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Devices (4)' })).toBeInTheDocument()
  })

  it('has no built-in margin (regression: callers must supply their own spacing, or spacing silently halves — see Fase revisione critica)', () => {
    render(<SectionHeader title="X" />)
    expect(screen.getByRole('heading')).toHaveStyle({ margin: '0px' })
  })
})
