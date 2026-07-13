import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'

const supabaseMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  profileSingle: vi.fn(),
  clientMaybeSingle: vi.fn(),
  assurance: vi.fn(),
  listFactors: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/config/env', () => ({
  env: { demoMode: false, basePath: '/AURA/' },
}))

vi.mock('@/data/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: supabaseMocks.getUser,
      onAuthStateChange: supabaseMocks.onAuthStateChange,
      signInWithOtp: supabaseMocks.signInWithOtp,
      signOut: supabaseMocks.signOut,
      mfa: {
        getAuthenticatorAssuranceLevel: supabaseMocks.assurance,
        listFactors: supabaseMocks.listFactors,
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => supabaseMocks.profileSingle(),
          maybeSingle: () =>
            table === 'clients' ? supabaseMocks.clientMaybeSingle() : supabaseMocks.profileSingle(),
        }),
      }),
    }),
  },
}))

type AuthListener = (event: string, session: { user: User } | null) => void
let authListener: AuthListener | null = null

function StateProbe() {
  const auth = useAuth()
  return (
    <>
      <p>
        {auth.loading ? 'loading' : 'ready'}:{auth.role ?? 'none'}:
        {auth.mfaChallengeRequired ? 'mfa' : 'no-mfa'}
      </p>
      <button onClick={() => void auth.signOut()}>Sign out</button>
      <button onClick={() => void auth.signInWithMagicLink('client@example.test')}>
        Send magic link
      </button>
    </>
  )
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StateProbe />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('AuthProvider connected transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authListener = null
    supabaseMocks.getUser.mockResolvedValue({ data: { user: null } })
    supabaseMocks.onAuthStateChange.mockImplementation((listener: AuthListener) => {
      authListener = listener
      queueMicrotask(() => listener('INITIAL_SESSION', null))
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    supabaseMocks.profileSingle.mockResolvedValue({
      data: { role: 'therapist' },
      error: null,
    })
    supabaseMocks.clientMaybeSingle.mockResolvedValue({ data: null, error: null })
    supabaseMocks.assurance.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    })
    supabaseMocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null })
    supabaseMocks.signInWithOtp.mockResolvedValue({ error: null })
    supabaseMocks.signOut.mockResolvedValue({ error: null })
  })

  it('keeps the protected role unpublished until MFA discovery completes', async () => {
    let resolveAssurance!: (value: {
      data: { currentLevel: string; nextLevel: string }
      error: null
    }) => void
    supabaseMocks.assurance.mockReturnValue(
      new Promise((resolve) => {
        resolveAssurance = resolve
      }),
    )
    supabaseMocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-one', status: 'verified' }] },
      error: null,
    })

    renderProvider()
    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()

    act(() => authListener?.('SIGNED_IN', { user: { id: 'therapist-one' } as User }))
    expect(await screen.findByText('loading:none:no-mfa')).toBeInTheDocument()

    await act(async () => {
      resolveAssurance({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    })

    expect(await screen.findByText('ready:therapist:mfa')).toBeInTheDocument()
  })

  it('uses the ordered auth subscription as the only session initializer', async () => {
    supabaseMocks.getUser.mockImplementation(() => new Promise(() => undefined))

    renderProvider()

    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()
    expect(supabaseMocks.getUser).not.toHaveBeenCalled()
  })

  it('discards an older sign-in completion as soon as explicit sign-out begins', async () => {
    let resolveProfile!: (value: { data: { role: 'therapist' }; error: null }) => void
    supabaseMocks.profileSingle.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve
      }),
    )

    renderProvider()
    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()

    act(() => authListener?.('SIGNED_IN', { user: { id: 'therapist-one' } as User }))
    expect(await screen.findByText('loading:none:no-mfa')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()

    await act(async () => {
      resolveProfile({ data: { role: 'therapist' }, error: null })
    })

    expect(screen.getByText('ready:none:no-mfa')).toBeInTheDocument()
  })

  it('fails closed when assurance discovery errors', async () => {
    supabaseMocks.assurance.mockResolvedValue({
      data: { currentLevel: null, nextLevel: null },
      error: { message: 'temporary assurance failure' },
    })

    renderProvider()
    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()

    act(() => authListener?.('SIGNED_IN', { user: { id: 'therapist-one' } as User }))

    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()
    expect(supabaseMocks.signOut).toHaveBeenCalled()
    expect(supabaseMocks.listFactors).not.toHaveBeenCalled()
  })

  it('fails closed when an AAL2 account factor cannot be discovered', async () => {
    supabaseMocks.assurance.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })
    supabaseMocks.listFactors.mockResolvedValue({
      data: { totp: [] },
      error: { message: 'temporary factor failure' },
    })

    renderProvider()
    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()

    act(() => authListener?.('SIGNED_IN', { user: { id: 'therapist-one' } as User }))

    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()
    expect(supabaseMocks.signOut).toHaveBeenCalled()
  })

  it('fails closed when AAL2 is indicated without a supported verified factor', async () => {
    supabaseMocks.assurance.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })
    supabaseMocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null })

    renderProvider()
    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()

    act(() => authListener?.('SIGNED_IN', { user: { id: 'therapist-one' } as User }))

    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()
    expect(supabaseMocks.signOut).toHaveBeenCalled()
  })

  it('requests magic links without creating unknown auth users', async () => {
    renderProvider()
    expect(await screen.findByText('ready:none:no-mfa')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(supabaseMocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'client@example.test',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/AURA/#/auth/callback`,
      },
    })
  })
})
