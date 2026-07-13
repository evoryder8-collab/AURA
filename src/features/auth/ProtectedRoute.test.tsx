import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthState } from './auth-context'
import { ProtectedRoute } from './ProtectedRoute'

const auth: AuthState = {
  loading: false,
  role: 'client',
  user: null,
  demoClientId: 'demo-client-mira',
  mfaChallengeRequired: false,
  error: null,
  signIn: async () => false,
  verifyMfa: async () => false,
  signInWithMagicLink: async () => false,
  enterDemo: () => undefined,
  signOut: async () => undefined,
}

describe('ProtectedRoute', () => {
  it('does not grant therapist access to a client role', () => {
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/therapist/today']}>
          <Routes>
            <Route element={<ProtectedRoute role="therapist" />}>
              <Route path="/therapist/today" element={<p>private therapist content</p>} />
            </Route>
            <Route path="/client/home" element={<p>client home</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByText('client home')).toBeInTheDocument()
    expect(screen.queryByText('private therapist content')).not.toBeInTheDocument()
  })
})
