import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccessDenied } from './AccessDenied'

describe('AccessDenied', () => {
  it('names the role required and the operator role you are signed in with', () => {
    render(<AccessDenied requiredRole="admin" yourRole="viewer" />)
    expect(screen.getByText(/Admin/)).toBeInTheDocument()
    expect(screen.getByText(/signed in as Viewer/)).toBeInTheDocument()
  })

  it('says so explicitly when nobody is signed in at all', () => {
    render(<AccessDenied requiredRole="operator" yourRole={null} />)
    expect(screen.getByText(/not signed in/)).toBeInTheDocument()
  })
})
