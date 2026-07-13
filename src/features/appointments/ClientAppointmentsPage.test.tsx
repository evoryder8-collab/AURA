import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createDemoState, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { ClientAppointmentsPage } from './ClientAppointmentsPage'

const auth: AuthState = {
  loading: false,
  role: 'client',
  user: null,
  demoClientId: 'demo-client-noa',
  demoTherapistId: null,
  mfaChallengeRequired: false,
  error: null,
  signIn: async () => false,
  verifyMfa: async () => false,
  signInWithMagicLink: async () => false,
  enterDemo: () => undefined,
  signOut: async () => undefined,
}

describe('client team appointment request', () => {
  beforeEach(() => useDemoStore.setState({ ...createDemoState(), hydrated: true }))

  it('lets the client choose a new team therapist and keeps one continuous client record', async () => {
    const user = userEvent.setup()
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <ClientAppointmentsPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(screen.getAllByText(/with elias rowan/i)).not.toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /request appointment/i }))

    const sora = screen.getByRole('radio', { name: /sora bell/i })
    expect(sora).toBeInTheDocument()
    await user.click(sora)
    await user.click(screen.getByRole('button', { name: /send request/i }))

    const created = useDemoStore.getState().appointments.at(-1)
    expect(created).toMatchObject({
      clientId: 'demo-client-noa',
      therapistId: DEMO_THERAPIST_IDS.sora,
      status: 'requested',
    })
    const state = useDemoStore.getState()
    expect(
      state.clients.find((client) => client.id === 'demo-client-noa')?.assignedTherapistIds,
    ).toContain(DEMO_THERAPIST_IDS.sora)
    expect(
      state.therapists.find((therapist) => therapist.id === DEMO_THERAPIST_IDS.sora)
        ?.assignedClientIds,
    ).toContain('demo-client-noa')
    const confirmation = screen.getByRole('status')
    expect(confirmation).toHaveTextContent(/preferred time with sora/i)
    expect(confirmation).toHaveFocus()
  })
})
