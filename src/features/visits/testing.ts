import { render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createDemoState } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'

/** Monday 23 Nov 2026, 08:00 on the test machine's clock; fixtures and slots both follow it. */
export const TEST_NOW = new Date(2026, 10, 23, 8, 0, 0)

export function seedDemo() {
  useDemoStore.setState({ ...createDemoState(), hydrated: true })
}

/** Renders one page signed in as a demo client or therapist. Plain .ts so the fast-refresh lint rule stays quiet. */
export function renderAs(who: { clientId: string } | { therapistId: string }, path: string, element: ReactElement) {
  const auth: AuthState = {
    loading: false,
    role: 'clientId' in who ? 'client' : 'therapist',
    user: null,
    demoClientId: 'clientId' in who ? who.clientId : null,
    demoTherapistId: 'therapistId' in who ? who.therapistId : null,
    mfaChallengeRequired: false,
    error: null,
    signIn: async () => false,
    verifyMfa: async () => false,
    signInWithMagicLink: async () => false,
    enterDemo: () => undefined,
    signOut: async () => undefined,
  }
  return render(
    createElement(
      AuthContext.Provider,
      { value: auth },
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          null,
          createElement(Route, { path, element }),
          createElement(Route, { path: '*', element: createElement('p', null, 'Another page') }),
        ),
      ),
    ),
  )
}
