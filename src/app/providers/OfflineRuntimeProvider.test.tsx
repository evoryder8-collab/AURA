import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import type { OfflineSyncController } from '@/lib/offline/sync-controller'

import { OfflineRuntimeProvider } from './OfflineRuntimeProvider'

function auth(overrides: Partial<AuthState> = {}): AuthState {
  return {
    loading: false,
    role: 'therapist',
    user: null,
    demoClientId: null,
    demoTherapistId: 'demo-therapist-sora',
    mfaChallengeRequired: false,
    error: null,
    signIn: vi.fn(async () => true),
    verifyMfa: vi.fn(async () => true),
    signInWithMagicLink: vi.fn(async () => true),
    enterDemo: vi.fn(),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('OfflineRuntimeProvider', () => {
  it('activates the authenticated owner and clears it when auth signs out', async () => {
    const runtime = {
      start: vi.fn(),
      stop: vi.fn(),
      activateOwner: vi.fn(async () => undefined),
      clearOwner: vi.fn(async () => undefined),
    } satisfies Pick<OfflineSyncController, 'start' | 'stop' | 'activateOwner' | 'clearOwner'>
    const view = render(
      <AuthContext.Provider value={auth()}>
        <OfflineRuntimeProvider runtime={runtime}>
          <span>application</span>
        </OfflineRuntimeProvider>
      </AuthContext.Provider>,
    )

    await waitFor(() => {
      expect(runtime.start).toHaveBeenCalledOnce()
      expect(runtime.activateOwner).toHaveBeenCalledWith('demo-therapist-sora')
    })

    view.rerender(
      <AuthContext.Provider value={auth({ role: null })}>
        <OfflineRuntimeProvider runtime={runtime}>
          <span>application</span>
        </OfflineRuntimeProvider>
      </AuthContext.Provider>,
    )
    await waitFor(() => {
      expect(runtime.clearOwner).toHaveBeenCalledWith('demo-therapist-sora')
    })

    view.unmount()
    expect(runtime.stop).toHaveBeenCalledOnce()
  })

  it('uses the backend-authenticated user id instead of presentation role data', async () => {
    const runtime = {
      start: vi.fn(),
      stop: vi.fn(),
      activateOwner: vi.fn(async () => undefined),
      clearOwner: vi.fn(async () => undefined),
    } satisfies Pick<OfflineSyncController, 'start' | 'stop' | 'activateOwner' | 'clearOwner'>
    render(
      <AuthContext.Provider
        value={auth({
          role: 'client',
          demoClientId: 'presentation-client-id',
          user: { id: 'authenticated-user-id' } as AuthState['user'],
        })}
      >
        <OfflineRuntimeProvider runtime={runtime}>
          <span>application</span>
        </OfflineRuntimeProvider>
      </AuthContext.Provider>,
    )

    await waitFor(() => {
      expect(runtime.activateOwner).toHaveBeenCalledWith('authenticated-user-id')
      expect(runtime.activateOwner).not.toHaveBeenCalledWith('presentation-client-id')
    })
  })
})
