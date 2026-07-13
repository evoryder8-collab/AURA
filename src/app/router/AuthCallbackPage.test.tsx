import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { AuthCallbackPage } from './PublicPages'

const baseAuth: AuthState = {
  loading: false,
  role: null,
  user: null,
  demoClientId: null,
  demoTherapistId: null,
  mfaChallengeRequired: false,
  error: null,
  signIn: async () => false,
  verifyMfa: async () => false,
  signInWithMagicLink: async () => false,
  enterDemo: () => undefined,
  signOut: async () => undefined,
}

function renderCallback(auth: AuthState) {
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/auth/callback']}>
        <Routes>
          <Route path="auth/callback" element={<AuthCallbackPage />} />
          <Route path="client/appointments" element={<p>Client appointments</p>} />
          <Route path="login/client" element={<p>Client MFA</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('AuthCallbackPage', () => {
  it('routes an authenticated client into the connected appointment portal', () => {
    renderCallback({
      ...baseAuth,
      role: 'client',
      user: { id: 'connected-client-user' } as AuthState['user'],
      demoClientId: 'connected-client-record',
    })

    expect(screen.getByText('Client appointments')).toBeInTheDocument()
  })

  it('routes an authenticated client requiring MFA to the verification screen', () => {
    renderCallback({
      ...baseAuth,
      role: 'client',
      user: { id: 'connected-client-user' } as AuthState['user'],
      demoClientId: 'connected-client-record',
      mfaChallengeRequired: true,
    })

    expect(screen.getByText('Client MFA')).toBeInTheDocument()
  })

  it('shows a non-enumerating failure when no authenticated session exists', () => {
    renderCallback(baseAuth)

    expect(screen.getByRole('heading', { name: /could not be completed/i })).toBeInTheDocument()
    expect(screen.getByText(/no account information has been shown/i)).toBeInTheDocument()
  })
})
