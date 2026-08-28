import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PresentationPage } from './PresentationPage'

describe('PresentationPage', () => {
  it('renders presentation preview title', () => {
    render(<PresentationPage />)
    expect(screen.getByText('Presentation Preview')).toBeInTheDocument()
  })

  it('displays all presentation panels', () => {
    render(<PresentationPage />)
    expect(screen.getByText('RGB LEFT')).toBeInTheDocument()
    expect(screen.getByText('RGB RIGHT')).toBeInTheDocument()
    expect(screen.getByText('THERMAL')).toBeInTheDocument()
  })

  it('shows that it is a static illustrative view', () => {
    render(<PresentationPage />)
    expect(screen.getByText(/does not represent simultaneous hardware acquisition/)).toBeInTheDocument()
  })

  it('displays sample badges', () => {
    render(<PresentationPage />)
    expect(screen.getAllByText('Recorded sample')).toHaveLength(2)
    expect(screen.getByText('Illustrative')).toBeInTheDocument()
  })

  it('credits SeaShips dataset', () => {
    render(<PresentationPage />)
    expect(screen.getByText(/SeaShips dataset/)).toBeInTheDocument()
  })
})
