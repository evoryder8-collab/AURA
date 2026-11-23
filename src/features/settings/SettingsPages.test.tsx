import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { PRACTICE_TIME_ZONE } from '@/lib/formatting/time'
import { SettingsPage } from './SettingsPages'

const auth: AuthState = {
  loading: false,
  role: 'therapist',
  user: null,
  demoClientId: null,
  demoTherapistId: 'demo-therapist-amara',
  mfaChallengeRequired: false,
  error: null,
  signIn: async () => false,
  verifyMfa: async () => false,
  signInWithMagicLink: async () => false,
  enterDemo: () => undefined,
  signOut: vi.fn(async () => undefined),
}

describe('SettingsPage (demo)', () => {
  it('shows real device preferences and no connected-only controls', async () => {
    const user = userEvent.setup()
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <SettingsPage role="therapist" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(screen.getByText(/animations are on/i)).toBeInTheDocument()
    expect(screen.getByText(PRACTICE_TIME_ZONE.replaceAll('_', ' '))).toBeInTheDocument()
    expect(screen.getByText(/stored in this browser only/i)).toBeInTheDocument()
    expect(screen.queryByText(/two-step sign-in/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset demo data/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^sign out$/i }))
    expect(auth.signOut).toHaveBeenCalled()
  })
})
