import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthContext, type AuthState } from './auth-context'
import { LoginPage } from './LoginPage'

vi.mock('@/config/env', () => ({ env: { demoMode: false, basePath: '/' } }))

function renderLogin(path: string, overrides: Partial<AuthState> = {}) {
  const auth: AuthState = {
    loading: false,
    role: null,
    user: null,
    demoClientId: null,
    mfaChallengeRequired: false,
    error: null,
    signIn: vi.fn(async () => true),
    verifyMfa: vi.fn(async () => true),
    signInWithMagicLink: vi.fn(async () => true),
    enterDemo: vi.fn(),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login/:role" element={<LoginPage />} />
          <Route path="/therapist/today" element={<p>therapist today</p>} />
          <Route path="/client/appointments" element={<p>client appointments</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { auth, user: userEvent.setup() }
}

describe('LoginPage connected to a real backend', () => {
  it('never lists or looks up anyone: the preview is only the typed name', async () => {
    const { user } = renderLogin('/login/therapist')
    expect(screen.queryByRole('group', { name: /fictional demo people/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/pratana|wassana|mira/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Your age')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Your full name'), 'Pratana Halstrick')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Pratana Halstrick' })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.queryByText(/massage therapist/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus()
  })

  it('signs in through the backend with the expected role and no demo shortcuts', async () => {
    const { user, auth } = renderLogin('/login/therapist')
    await user.type(screen.getByLabelText('Your full name'), 'Jamie Rivera')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.queryByRole('button', { name: /fill demo sign-in/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/synthetic demo/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Username or email'), ' jamie@example.test ')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(auth.signIn).toHaveBeenCalledWith({
      identifier: 'jamie@example.test',
      password: 'pass',
      expectedRole: 'therapist',
    })
    expect(auth.enterDemo).not.toHaveBeenCalled()
    expect(await screen.findByText('therapist today')).toBeInTheDocument()
  })

  it('announces a backend refusal', async () => {
    const { user } = renderLogin('/login/therapist', {
      signIn: vi.fn(async () => false),
      error: 'The sign-in details could not be verified.',
    })
    await user.type(screen.getByLabelText('Your full name'), 'Jamie Rivera')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Username or email'), 'jamie')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The sign-in details could not be verified.',
    )
    expect(screen.getByLabelText('Username or email')).toBeInTheDocument()
  })

  it('sends a client a sign-in link only to an email address', async () => {
    const { user, auth } = renderLogin('/login/client')
    await user.type(screen.getByLabelText('Your full name'), 'Jamie Rivera')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.type(screen.getByLabelText('Username or email'), 'jamie')
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/enter your email address/i)
    expect(auth.signInWithMagicLink).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Username or email'))
    await user.type(screen.getByLabelText('Username or email'), 'jamie@example.test')
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(auth.signInWithMagicLink).toHaveBeenCalledWith('jamie@example.test')
    expect(await screen.findByRole('status')).toHaveTextContent(/check your email/i)
  })

  it('asks for the authenticator code when the account needs it', async () => {
    const { user, auth } = renderLogin('/login/therapist', { mfaChallengeRequired: true })
    expect(screen.getByRole('heading', { name: 'Enter your 6-digit code' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/6-digit code/i)

    await user.type(screen.getByLabelText('Code from your authenticator app'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(auth.verifyMfa).toHaveBeenCalledWith('123456')
    expect(await screen.findByText('therapist today')).toBeInTheDocument()
  })
})
