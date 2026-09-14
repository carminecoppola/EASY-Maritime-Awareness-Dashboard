import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PresentationPage } from './PresentationPage'

describe('PresentationPage', () => {
  it('renders the page title', () => {
    render(<PresentationPage />)
    expect(screen.getByRole('heading', { name: 'Presentation Preview' })).toBeInTheDocument()
  })

  it('displays all presentation panels', () => {
    render(<PresentationPage />)
    expect(screen.getByText('RGB Left sample')).toBeInTheDocument()
    expect(screen.getByText('RGB Right sample')).toBeInTheDocument()
    expect(screen.getByText('Thermal reference')).toBeInTheDocument()
  })

  it('states the recorded-source provenance prominently', () => {
    render(<PresentationPage />)
    expect(screen.getByText(/does not represent simultaneous live sensor acquisition/)).toBeInTheDocument()
    expect(screen.getByText('PRESENTATION MODE')).toBeInTheDocument()
  })

  it('labels every sample with its provenance', () => {
    render(<PresentationPage />)
    expect(screen.getAllByText('SEASHIPS · RECORDED')).toHaveLength(2)
    expect(screen.getByText('ILLUSTRATIVE')).toBeInTheDocument()
  })

  it('credits the SeaShips dataset', () => {
    render(<PresentationPage />)
    expect(screen.getAllByText(/SeaShips dataset/).length).toBeGreaterThan(0)
  })

  it('performs no hardware action', () => {
    render(<PresentationPage />)
    expect(screen.getByText(/no hardware actions/)).toBeInTheDocument()
  })
})
