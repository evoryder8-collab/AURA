import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { env } from '@/config/env'
import { supabase } from '@/data/supabase/client'
import { AuthContext, type AuraRole, type AuthState } from './auth-context'

const sessionKey = 'aura-demo-session'

async function getRequiredTotpFactorId() {
  if (!supabase) return null
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (
    assurance.error ||
    assurance.data.currentLevel === 'aal2' ||
    assurance.data.nextLevel !== 'aal2'
  ) {
    return null
  }
  const factors = await supabase.auth.mfa.listFactors()
  if (factors.error) return null
  return factors.data.totp.find((factor) => factor.status === 'verified')?.id ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(!env.demoMode)
  const [role, setRole] = useState<AuraRole | null>(() => {
    if (!env.demoMode) return null
    const value = sessionStorage.getItem(sessionKey)
    if (!value) return null
    try {
      return (JSON.parse(value) as { role: AuraRole }).role
    } catch {
      return null
    }
  })
  const [demoClientId, setDemoClientId] = useState<string | null>(() => {
    const value = sessionStorage.getItem(sessionKey)
    if (!value) return null
    try {
      return (JSON.parse(value) as { clientId?: string }).clientId ?? null
    } catch {
      return null
    }
  })
  const [user, setUser] = useState<User | null>(null)
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const authClient = supabase
    if (!authClient) {
      setLoading(false)
      return
    }

    const loadRole = async (nextUser: User | null) => {
      setUser(nextUser)
      if (!nextUser) {
        setRole(null)
        setMfaChallengeRequired(false)
        setMfaFactorId(null)
        setLoading(false)
        return
      }
      const response = await authClient
        .from('profiles')
        .select('role')
        .eq('id', nextUser.id)
        .single()
      if (
        response.error ||
        (response.data?.role !== 'therapist' && response.data?.role !== 'client')
      ) {
        await authClient.auth.signOut()
        setError('Your account does not have an authorized AURA role.')
        setRole(null)
      } else {
        setRole(response.data.role)
        if (response.data.role === 'client') {
          const linkedClient = await authClient
            .from('clients')
            .select('id')
            .eq('auth_user_id', nextUser.id)
            .maybeSingle()
          if (linkedClient.error || !linkedClient.data?.id) {
            await authClient.auth.signOut()
            setError('Your account is not linked to an authorized client record.')
            setRole(null)
            setDemoClientId(null)
            setLoading(false)
            return
          }
          setDemoClientId(linkedClient.data.id)
        } else {
          setDemoClientId(null)
        }
        const factorId = await getRequiredTotpFactorId()
        setMfaFactorId(factorId)
        setMfaChallengeRequired(Boolean(factorId))
      }
      setLoading(false)
    }

    void authClient.auth.getUser().then(({ data }) => loadRole(data.user))
    const { data: subscription } = authClient.auth.onAuthStateChange((_event, session) => {
      void loadRole(session?.user ?? null)
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      role,
      user,
      demoClientId,
      mfaChallengeRequired,
      error,
      async signIn({ identifier, password }) {
        setError(null)
        if (!supabase) return false
        const isEmail = identifier.includes('@')
        if (!isEmail) {
          const resolved = await supabase.functions.invoke('resolve-username', {
            body: { identifier, password },
          })
          const accessToken = resolved.data?.session?.access_token
          const refreshToken = resolved.data?.session?.refresh_token
          if (
            resolved.error ||
            typeof accessToken !== 'string' ||
            typeof refreshToken !== 'string'
          ) {
            setError('The sign-in details could not be verified.')
            return false
          }
          const session = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (session.error) {
            setError('The sign-in details could not be verified.')
            return false
          }
        } else {
          const response = await supabase.auth.signInWithPassword({ email: identifier, password })
          if (response.error) {
            setError('The sign-in details could not be verified.')
            return false
          }
        }
        const factorId = await getRequiredTotpFactorId()
        if (factorId) {
          setMfaFactorId(factorId)
          setMfaChallengeRequired(true)
          return false
        }
        return true
      },
      async verifyMfa(code) {
        setError(null)
        if (!supabase) return false
        const factorId = mfaFactorId ?? (await getRequiredTotpFactorId())
        if (!factorId) {
          setError('A verified authenticator could not be found for this account.')
          return false
        }
        const response = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
        if (response.error) {
          setError('The verification code could not be confirmed.')
          return false
        }
        setMfaChallengeRequired(false)
        setMfaFactorId(null)
        return true
      },
      async signInWithMagicLink(email) {
        setError(null)
        if (!supabase) return false
        const response = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}${env.basePath}#/auth/callback` },
        })
        if (response.error) {
          setError('A sign-in link could not be sent.')
          return false
        }
        return true
      },
      enterDemo(nextRole, clientId = 'demo-client-mira') {
        const session = { role: nextRole, clientId: nextRole === 'client' ? clientId : null }
        sessionStorage.setItem(sessionKey, JSON.stringify(session))
        setRole(nextRole)
        setDemoClientId(session.clientId)
        setError(null)
      },
      async signOut() {
        sessionStorage.removeItem(sessionKey)
        if (supabase) await supabase.auth.signOut({ scope: 'global' })
        setRole(null)
        setUser(null)
        setDemoClientId(null)
        setMfaChallengeRequired(false)
        setMfaFactorId(null)
      },
    }),
    [demoClientId, error, loading, mfaChallengeRequired, mfaFactorId, role, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
