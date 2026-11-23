import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { createDemoTherapists } from '@/data/demo/fixtures'
import { AuthContext, type AuthState } from './auth-context'
import { getIdentityAge } from './identity'
import { LoginPage } from './LoginPage'

vi.mock('@/config/env', () => ({ env: { demoMode: true, basePath: '/' } }))

const ageOf = (dateOfBirth: string) =>
  String(getIdentityAge({ id: 'age', name: 'Age', dateOfBirth }))
const [pratana] = createDemoTherapists()
const PRATANA_AGE = ageOf(pratana?.dateOfBirth ?? '')

function renderLogin(path = '/login/therapist') {
  const auth: AuthState = {
    loading: false,
    role: null,
    user: null,
    demoClientId: null,
    mfaChallengeRequired: false,
    error: null,
    signIn: vi.fn(async () => false),
    verifyMfa: vi.fn(async () => false),
    signInWithMagicLink: vi.fn(async () => false),
    enterDemo: vi.fn(),
    signOut: vi.fn(async () => undefined),
  }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>entrance</p>} />
          <Route path="/login/:role" element={<LoginPage />} />
          <Route path="/therapist/today" element={<p>therapist today</p>} />
          <Route path="/client/home" element={<p>client home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { auth, user: userEvent.setup() }
}

async function revealPratana(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your full name'), 'Pratana Halstrick')
  await user.type(screen.getByLabelText('Your age'), PRATANA_AGE)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('LoginPage in the synthetic demo', () => {
  it('starts on the name, then reveals the matching person and moves focus to the answer', async () => {
    const { user } = renderLogin()
    expect(screen.getByRole('heading', { level: 1, name: 'Therapist sign-in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your full name')).toHaveFocus()

    await revealPratana(user)

    expect(screen.getByRole('heading', { level: 1, name: 'Pratana Halstrick' })).toBeInTheDocument()
    expect(document.querySelector('img.reveal__portrait')).toHaveAttribute(
      'src',
      '/portraits/pratana-hero.webp',
    )
    expect(screen.getByRole('button', { name: /that’s me/i })).toHaveFocus()
  })

  it('asks for both details, then gives one answer for an unknown name or a wrong age', async () => {
    const { user } = renderLogin()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Enter your name.')).toHaveAttribute('role', 'alert')
    expect(screen.getByText(/enter your age/i)).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Your full name')).toHaveAttribute('aria-invalid', 'true')

    await user.type(screen.getByLabelText('Your full name'), 'Pratana Halstrick')
    await user.type(screen.getByLabelText('Your age'), String(Number(PRATANA_AGE) + 1))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'We couldn’t find that name and age. Check both and try again.',
    )

    await user.clear(screen.getByLabelText('Your full name'))
    await user.type(screen.getByLabelText('Your full name'), 'Someone Else')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t find that name and age.')
    expect(screen.queryByRole('heading', { name: 'Pratana Halstrick' })).not.toBeInTheDocument()
  })

  it('offers labelled fictional shortcuts that reveal at once', async () => {
    const { user } = renderLogin()
    const people = screen.getByRole('group', { name: 'Fictional demo people' })
    expect(within(people).getAllByRole('button')).toHaveLength(2)
    await user.click(within(people).getByRole('button', { name: /wassana schlaepfer, age \d+/i }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Wassana Schlaepfer' }),
    ).toBeInTheDocument()
  })

  it('checks the sign-in details and announces a wrong username', async () => {
    const { user, auth } = renderLogin()
    await revealPratana(user)
    await user.click(screen.getByRole('button', { name: /that’s me/i }))

    expect(screen.getByRole('heading', { name: 'Your sign-in details' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Synthetic demo: any password of 8 or more characters works; nothing is sent anywhere.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Username or email')).toHaveFocus()

    await user.type(screen.getByLabelText('Username or email'), 'wassana')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText(/that isn’t pratana’s demo sign-in/i)).toHaveAttribute('role', 'alert')
    expect(screen.getByText('Use at least 8 characters.')).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Username or email')).toHaveFocus()
    expect(auth.enterDemo).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Username or email'))
    await user.type(screen.getByLabelText('Username or email'), 'Pratana@aura-demo.invalid')
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'eight888')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(auth.enterDemo).toHaveBeenCalledWith('therapist', 'demo-therapist-amara')
    expect(screen.getByText('therapist today')).toBeInTheDocument()
  })

  it('fills the demo sign-in for a client and lands on their home', async () => {
    const { user, auth } = renderLogin('/login/client')
    await user.click(screen.getByRole('button', { name: /mira ellison, age/i }))
    expect(screen.getByText('Sees Pratana and Wassana')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    await user.click(screen.getByRole('button', { name: /that’s me/i }))
    await user.click(screen.getByRole('button', { name: 'Fill demo sign-in' }))

    expect(screen.getByLabelText('Username or email')).toHaveValue('mira')
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(auth.enterDemo).toHaveBeenCalledWith('client', 'demo-client-mira')
    expect(screen.getByText('client home')).toBeInTheDocument()
  })

  it('starts again from an empty name field', async () => {
    const { user } = renderLogin()
    await revealPratana(user)
    await user.click(screen.getByRole('button', { name: /not me, start again/i }))
    expect(screen.getByLabelText('Your full name')).toHaveValue('')
    expect(screen.getByLabelText('Your full name')).toHaveFocus()
  })
})
