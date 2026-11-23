import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createDemoState } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { ClientsPage } from './ClientsPage'

function authFor(therapistId: string): AuthState {
  return {
    loading: false,
    role: 'therapist',
    user: null,
    demoClientId: null,
    demoTherapistId: therapistId,
    mfaChallengeRequired: false,
    error: null,
    signIn: async () => false,
    verifyMfa: async () => false,
    signInWithMagicLink: async () => false,
    enterDemo: () => undefined,
    signOut: async () => undefined,
  }
}

function renderClients(therapistId = 'demo-therapist-amara') {
  return render(
    <AuthContext.Provider value={authFor(therapistId)}>
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const rowFor = (name: RegExp) => screen.getByRole('link', { name })

describe('ClientsPage', () => {
  beforeEach(() => useDemoStore.setState({ ...createDemoState(), hydrated: true }))

  it('lists only the clients assigned to the signed-in therapist', () => {
    renderClients()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(rowFor(/mira ellison/i)).toHaveAttribute('href', '/therapist/clients/demo-client-mira')
    expect(rowFor(/noa lindqvist/i)).toHaveAttribute('href', '/therapist/clients/demo-client-noa')
    expect(screen.queryByText(/sage okafor/i)).not.toBeInTheDocument()
  })

  it('shows the next visit with any therapist, the latest update since the last visit and the care team', () => {
    renderClients()
    const mira = rowFor(/mira ellison/i)
    // Mira's next visit is with Wassana, not the signed-in therapist.
    expect(mira).toHaveTextContent(/tomorrow · \d\d:\d\d with wassana/i)
    expect(within(mira).getByLabelText('5 out of 10')).toBeInTheDocument()
    expect(mira).toHaveTextContent(/left shoulder/i)
    expect(mira).toHaveTextContent(/care team: pratana, wassana/i)

    const noa = rowFor(/noa lindqvist/i)
    expect(noa).toHaveTextContent(/with you/i)
    expect(noa).toHaveTextContent(/lower back · yesterday/i)
    expect(within(noa).getByLabelText('5 out of 10')).toBeInTheDocument()
  })

  it('hides health updates when the client has not shared health details', () => {
    useDemoStore.getState().updateConsent('demo-client-noa', 'healthData', false)
    renderClients()
    const noa = rowFor(/noa lindqvist/i)
    expect(noa).toHaveTextContent(/health details are not shared/i)
    expect(within(noa).queryByLabelText(/out of 10/)).not.toBeInTheDocument()
  })

  it('filters by name and says when nothing matches', async () => {
    const user = userEvent.setup()
    renderClients()
    const search = screen.getByRole('searchbox', { name: /search your clients/i })

    await user.type(search, 'noa')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('1 of 2 clients match.')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'sage')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(/no client matches/i)).toBeInTheDocument()
  })

  it('scopes a different therapist to their own assignments', () => {
    renderClients('demo-therapist-sora')
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/therapist/clients/demo-client-mira',
      '/therapist/clients/demo-client-sage',
    ])
  })
})
