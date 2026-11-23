import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EntrancePage } from './EntrancePage'

describe('EntrancePage', () => {
  beforeEach(() => sessionStorage.clear())

  it('offers both roles as plain links that grant nothing on their own', () => {
    render(
      <MemoryRouter>
        <EntrancePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'AURA' })).toBeInTheDocument()
    const roles = screen.getByRole('navigation', { name: 'Sign in' })
    expect(roles).toContainElement(screen.getByRole('link', { name: /i’m a client/i }))
    expect(screen.getByRole('link', { name: /i’m a client/i })).toHaveAttribute(
      'href',
      '/login/client',
    )
    expect(screen.getByRole('link', { name: /i’m a therapist/i })).toHaveAttribute(
      'href',
      '/login/therapist',
    )
    expect(sessionStorage.getItem('aura-demo-session')).toBeNull()
  })

  it('keeps the animated scene out of the accessibility tree', () => {
    const { container } = render(
      <MemoryRouter>
        <EntrancePage />
      </MemoryRouter>,
    )
    expect(container.querySelector('.dusk')).toHaveAttribute('aria-hidden', 'true')
  })
})
