import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HelpPage } from './HelpPage'

// HelpPage links now use react-router's <Link> instead of a plain <a> (the
// old version did a full page reload on every click), so it needs a Router
// context to render.
function renderHelpPage() {
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  )
}

describe('HelpPage', () => {
  it('renders the help page title', () => {
    renderHelpPage()
    expect(screen.getByText('Help')).toBeInTheDocument()
  })

  it('renders the workflow steps', () => {
    renderHelpPage()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getAllByText('Mission').length).toBeGreaterThan(0)
    expect(screen.getByText('Capture')).toBeInTheDocument()
    expect(screen.getByText('Archive')).toBeInTheDocument()
  })

  it('renders the page guide with working client-side links', () => {
    renderHelpPage()
    const missionLink = screen.getByText('Why start a mission?').closest('a')
    expect(missionLink).toHaveAttribute('href', '/mission')
  })

  it('reveals the checklist and troubleshooting once expanded', () => {
    renderHelpPage()
    expect(screen.queryByText('Feed is offline?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Checklist & Troubleshooting'))
    expect(screen.getByText('Feed is offline?')).toBeInTheDocument()
    expect(screen.getByText('Before collecting important data')).toBeInTheDocument()
  })
})
