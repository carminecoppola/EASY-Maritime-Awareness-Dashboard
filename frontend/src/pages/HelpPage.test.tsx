import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HelpPage } from './HelpPage'

describe('HelpPage', () => {
  it('renders the help page title', () => {
    render(<HelpPage />)
    expect(screen.getByText('Help & Documentation')).toBeInTheDocument()
  })

  it('renders recommended workflow section', () => {
    render(<HelpPage />)
    expect(screen.getByText(/Recommended Workflow/)).toBeInTheDocument()
  })

  it('renders troubleshooting section', () => {
    render(<HelpPage />)
    expect(screen.getByText(/Tips & Troubleshooting/)).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<HelpPage />)
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
  })
})
