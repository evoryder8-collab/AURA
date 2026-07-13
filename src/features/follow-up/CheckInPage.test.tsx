import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createDemoState } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { CheckInPage } from './CheckInPage'

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

describe('adaptive check-in', () => {
  beforeEach(() => useDemoStore.setState(createDemoState()))

  it('completes an unchanged returning check-in in one primary action', async () => {
    const user = userEvent.setup()
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/client/check-in/appointment-mira-today']}>
          <Routes>
            <Route path="/client/check-in/:appointmentId" element={<CheckInPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByText(/about 20 seconds/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /confirm unchanged/i }))
    expect(screen.getByRole('heading', { name: /you’re ready.*for today/i })).toBeInTheDocument()
  })
})
