import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createDemoState } from '@/data/demo/fixtures'
import { clientBonus } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { useFreshAuthStore } from '@/features/consent/freshAuth'
import { MePage } from './MePage'

const MIRA = 'demo-client-mira'

const auth: AuthState = {
  loading: false,
  role: 'client',
  user: null,
  demoClientId: MIRA,
  demoTherapistId: null,
  mfaChallengeRequired: false,
  error: null,
  signIn: async () => false,
  verifyMfa: async () => false,
  signInWithMagicLink: async () => false,
  enterDemo: () => undefined,
  signOut: vi.fn(async () => undefined),
}

const consents = () =>
  useDemoStore.getState().clients.find((client) => client.id === MIRA)!.consents
const confirmNow = () =>
  useFreshAuthStore.setState({ confirmedAt: { [`client:${MIRA}`]: new Date().toISOString() } })

function renderMe() {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <MePage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('MePage', () => {
  beforeEach(() => {
    useDemoStore.setState({ ...createDemoState(), hydrated: true })
    useFreshAuthStore.setState({ confirmedAt: {} })
  })

  it('shows who you are, your care team and extra care from the shared bonus ledger', () => {
    renderMe()
    expect(screen.getByRole('heading', { level: 1, name: 'Mira Ellison' })).toBeInTheDocument()
    expect(screen.getByText('Synthetic demo client')).toBeInTheDocument()

    const team = within(screen.getByRole('region', { name: /your care team/i }))
    expect(team.getByText('Pratana Halstrick').closest('li')).toHaveTextContent(
      /4\s+visits together/,
    )
    expect(team.getByText('Wassana Schlaepfer').closest('li')).toHaveTextContent(
      /2\s+visits together/,
    )

    const bonus = clientBonus(useDemoStore.getState(), MIRA)
    const extra = within(screen.getByRole('region', { name: /extra care/i }))
    expect(extra.getByText(String(bonus.lifetimeMinutes))).toBeInTheDocument()
    for (const item of bonus.byTherapist) {
      expect(extra.getByText(new RegExp(`^${item.minutes}\\s+min$`))).toBeInTheDocument()
    }
    expect(screen.getByRole('region', { name: /reports for/i })).toBeInTheDocument()
  })

  it('asks the client to confirm before the first consent change, then applies it', async () => {
    const user = userEvent.setup()
    renderMe()
    const photography = screen.getByRole('switch', { name: /progress photos/i })
    expect(photography).toHaveAttribute('aria-checked', 'false')
    expect(photography).toHaveAccessibleDescription(/camera stays closed/i)

    await user.click(photography)
    const dialog = screen.getByRole('dialog', { name: /change a consent choice/i })
    expect(consents().photography).toBe(false)
    await user.type(within(dialog).getByLabelText(/type demo to confirm/i), 'DEMO')
    await user.click(within(dialog).getByRole('button', { name: /^confirm$/i }))

    expect(consents().photography).toBe(true)
    expect(screen.getByRole('switch', { name: /progress photos/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('button', { name: /take a photo/i })).toBeInTheDocument()

    // Still confirmed: the next change applies straight away.
    await user.click(screen.getByRole('switch', { name: /reminders/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(consents().reminders).toBe(false)
    expect(screen.getByText('Reminders turned off.')).toBeInTheDocument()
  })

  it('keeps the camera closed and explains why while photography is off', () => {
    renderMe()
    const photos = within(screen.getByRole('region', { name: /progress photos/i }))
    expect(photos.getByText(/photography is off in your consent choices/i)).toBeInTheDocument()
    expect(photos.queryByRole('button', { name: /take a photo/i })).not.toBeInTheDocument()
  })

  it('shows saved photos after confirmation and deletes one only after a second confirmation', async () => {
    useDemoStore.getState().updateConsent(MIRA, 'photography', true)
    useDemoStore
      .getState()
      .addPhoto({ clientId: MIRA, view: 'side', dataUrl: 'data:image/jpeg;base64,AAAA' })
    useDemoStore.getState().addPhoto({
      clientId: 'demo-client-noa',
      view: 'front',
      dataUrl: 'data:image/jpeg;base64,BBBB',
    })
    const user = userEvent.setup()
    renderMe()

    const photos = within(screen.getByRole('region', { name: /progress photos/i }))
    expect(photos.getByText(/1 saved photo/i)).toBeInTheDocument()
    expect(photos.queryByRole('img')).not.toBeInTheDocument()
    await user.click(photos.getByRole('button', { name: /show photos/i }))
    await user.type(screen.getByLabelText(/type demo to confirm/i), 'DEMO')
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))

    expect(photos.getAllByRole('img')).toHaveLength(1)
    await user.click(photos.getByRole('button', { name: /delete photo: side view/i }))
    const dialog = screen.getByRole('dialog', { name: /delete this photo/i })
    expect(useDemoStore.getState().photos).toHaveLength(2)
    await user.click(within(dialog).getByRole('button', { name: /delete photo/i }))

    expect(useDemoStore.getState().photos.map((photo) => photo.clientId)).toEqual([
      'demo-client-noa',
    ])
    expect(photos.getByText(/no photos yet/i)).toBeInTheDocument()
  })

  it('resets the synthetic demo only after confirmation', async () => {
    useDemoStore.getState().updateConsent(MIRA, 'photography', true)
    confirmNow()
    const user = userEvent.setup()
    renderMe()

    await user.click(screen.getByRole('button', { name: /reset demo data/i }))
    const dialog = screen.getByRole('dialog', { name: /reset the synthetic demo/i })
    expect(consents().photography).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: /keep my changes/i }))
    expect(consents().photography).toBe(true)

    await user.click(screen.getByRole('button', { name: /reset demo data/i }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /reset demo data/i }),
    )
    expect(consents().photography).toBe(false)
    expect(screen.getByText(/demo data reset to its starting state/i)).toBeInTheDocument()
  })

  it('links to settings and signs out', async () => {
    const user = userEvent.setup()
    renderMe()
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/client/settings',
    )
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(auth.signOut).toHaveBeenCalled()
  })
})
