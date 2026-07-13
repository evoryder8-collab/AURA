import { createContext, useContext } from 'react'
import type { User } from '@supabase/supabase-js'

export type AuraRole = 'therapist' | 'client'

export type AuthState = {
  loading: boolean
  role: AuraRole | null
  user: User | null
  demoClientId: string | null
  demoTherapistId?: string | null
  mfaChallengeRequired: boolean
  error: string | null
  signIn: (input: {
    identifier: string
    password: string
    expectedRole: AuraRole
  }) => Promise<boolean>
  verifyMfa: (code: string) => Promise<boolean>
  signInWithMagicLink: (email: string) => Promise<boolean>
  enterDemo: (role: AuraRole, profileId?: string) => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
