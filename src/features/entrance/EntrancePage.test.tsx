import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EntrancePage } from './EntrancePage'

describe('EntrancePage', () => {
  beforeEach(() => localStorage.clear())

  it('offers both presentation roles without granting authorization', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <EntrancePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /step into.*your aura/i })).toBeInTheDocument()
    const therapist = screen.getByRole('link', { name: /i am a therapist/i })
    expect(therapist).toHaveAttribute('href', '/login/therapist')
    expect(screen.getByRole('link', { name: /i am a client/i })).toHaveAttribute(
      'href',
      '/login/client',
    )

    await user.hover(therapist)
    expect(localStorage.getItem('aura-visual-role')).toBe('therapist')
    expect(sessionStorage.getItem('aura-demo-session')).toBeNull()
  })
})
