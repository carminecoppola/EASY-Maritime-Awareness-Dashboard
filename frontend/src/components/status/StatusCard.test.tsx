import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusCard } from './StatusCard'
import { TONES } from './severityColors'

describe('StatusCard', () => {
  it('renders the value in the default text color when no valueTone is given', () => {
    render(<StatusCard title="Devices" value="4/4" />)
    expect(screen.getByText('4/4')).toHaveStyle({ color: 'var(--text-primary)' })
  })

  it('colors the value itself (not just a badge) when valueTone is given — the point of the prop', () => {
    render(<StatusCard title="Devices" value="1/4" valueTone={TONES.critical} />)
    expect(screen.getByText('1/4')).toHaveStyle({ color: TONES.critical.color })
  })
})
