import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createDemoState } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'

export function demoAuth(role: 'client' | 'therapist', id: string): AuthState {
  return {
    loading: false,
    role,
    user: null,
    demoClientId: role === 'client' ? id : null,
    demoTherapistId: role === 'therapist' ? id : null,
    mfaChallengeRequired: false,
    error: null,
    signIn: async () => false,
    verifyMfa: async () => false,
    signInWithMagicLink: async () => false,
    enterDemo: () => undefined,
    signOut: async () => undefined,
  }
}

export function resetDemoStore(now?: Date) {
  useDemoStore.setState({ ...createDemoState(now), hydrated: true })
}

/** Renders one routed page with a synthetic signed-in role. */
export function renderPage(
  element: ReactElement,
  { path, url, auth }: { path: string; url: string; auth: AuthState },
) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}
