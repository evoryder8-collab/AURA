import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { ConnectedClientAppointmentsPage } from './ConnectedClientAppointmentsPage'

const repositoryMocks = vi.hoisted(() => ({
  createAppointment: vi.fn(),
}))

vi.mock('@/data/repositories', () => ({
  createAuraRepositories: () => ({
    mode: 'supabase',
    clients: {
      get: vi.fn(async () => ({
        source: 'supabase',
        id: 'connected-client',
        practiceId: 'practice-one',
        authUserId: 'connected-user',
        preferredName: 'Connected Client',
        legalName: null,
        email: null,
        phone: null,
        dateOfBirth: null,
        intakeStatus: 'complete',
        active: true,
        createdBy: null,
        createdAt: null,
        updatedAt: null,
      })),
    },
    appointments: {
      list: vi.fn(async () => []),
      create: repositoryMocks.createAppointment,
    },
    therapists: {
      listBookable: vi.fn(async () => [
        {
          source: 'supabase',
          userId: 'therapist-amara',
          directorySlug: 'amara',
          professionalName: 'Amara Vale',
          professionalTitle: 'Massage therapist',
          publicPortraitPath: null,
        },
        {
          source: 'supabase',
          userId: 'therapist-sora',
          directorySlug: 'sora',
          professionalName: 'Sora Bell',
          professionalTitle: 'Therapeutic massage practitioner',
          publicPortraitPath: null,
        },
      ]),
    },
  }),
}))

const auth: AuthState = {
  loading: false,
  role: 'client',
  user: { id: 'connected-user' } as AuthState['user'],
  demoClientId: 'connected-client',
  demoTherapistId: null,
  mfaChallengeRequired: false,
  error: null,
  signIn: async () => false,
  verifyMfa: async () => false,
  signInWithMagicLink: async () => false,
  enterDemo: () => undefined,
  signOut: async () => undefined,
}

describe('connected client appointment booking', () => {
  it('loads the protected directory and sends the selected therapist through the repository', async () => {
    repositoryMocks.createAppointment.mockResolvedValue({ id: 'created-request' })
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <ConnectedClientAppointmentsPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: /request appointment/i }))
    await user.click(screen.getByRole('radio', { name: /sora bell/i }))
    await user.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() =>
      expect(repositoryMocks.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'connected-client',
          therapistUserId: 'therapist-sora',
          status: 'requested',
          intakeStatusSnapshot: 'complete',
        }),
      ),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/preferred time with sora bell/i)
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[0] === 'connected')
        .every((query) => query.queryKey[1] === 'connected-user'),
    ).toBe(true)
  })
})
