import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { env } from '@/config/env'
import { supabase } from '@/data/supabase/client'
import { AuthContext, type AuraRole, type AuthState } from './auth-context'

const sessionKey = 'aura-demo-session'
const mfaDiscoveryError =
  'Secure account verification is temporarily unavailable. Please try again.'

type MfaRequirement =
  { status: 'not-required' } | { status: 'challenge'; factorId: string } | { status: 'error' }

async function getMfaRequirement(): Promise<MfaRequirement> {
  if (!supabase) return { status: 'error' }
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance.error) return { status: 'error' }
  if (assurance.data.currentLevel === 'aal2' || assurance.data.nextLevel !== 'aal2')
    return { status: 'not-required' }

  const factors = await supabase.auth.mfa.listFactors()
  if (factors.error) return { status: 'error' }
  const factorId = factors.data.totp.find((factor) => factor.status === 'verified')?.id
  return factorId ? { status: 'challenge', factorId } : { status: 'error' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const previousAuthUserId = useRef<string | null>(null)
  const authTransitionSequence = useRef(0)
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
  const [demoTherapistId, setDemoTherapistId] = useState<string | null>(() => {
    const value = sessionStorage.getItem(sessionKey)
    if (!value) return null
    try {
      return (JSON.parse(value) as { therapistId?: string }).therapistId ?? null
    } catch {
      return null
    }
  })
  const [user, setUser] = useState<User | null>(null)
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clearConnectedCache = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: ['connected'] })
    queryClient.removeQueries({ queryKey: ['connected'] })
  }, [queryClient])

  useEffect(() => {
    const authClient = supabase
    if (!authClient) {
      setLoading(false)
      return
    }

    const loadRole = async (nextUser: User | null) => {
      const transition = ++authTransitionSequence.current
      const nextUserId = nextUser?.id ?? null

      // Fail closed while every backend role, client link, and MFA requirement is recomputed. No
      // protected route or connected query may observe a newly authenticated AAL1 user early.
      setLoading(true)
      setRole(null)
      setUser(null)
      setDemoClientId(null)
      setDemoTherapistId(null)
      setMfaChallengeRequired(false)
      setMfaFactorId(null)

      if (previousAuthUserId.current !== nextUserId) {
        previousAuthUserId.current = nextUserId
        await clearConnectedCache()
      }
      if (transition !== authTransitionSequence.current) return

      if (!nextUser) {
        setLoading(false)
        return
      }
      const response = await authClient
        .from('profiles')
        .select('role')
        .eq('id', nextUser.id)
        .single()
      if (transition !== authTransitionSequence.current) return

      if (
        response.error ||
        (response.data?.role !== 'therapist' && response.data?.role !== 'client')
      ) {
        setError('Your account does not have an authorized AURA role.')
        await authClient.auth.signOut()
        if (transition === authTransitionSequence.current) setLoading(false)
        return
      }

      const nextRole = response.data.role
      let linkedClientId: string | null = null
      if (nextRole === 'client') {
        const linkedClient = await authClient
          .from('clients')
          .select('id')
          .eq('auth_user_id', nextUser.id)
          .maybeSingle()
        if (transition !== authTransitionSequence.current) return
        if (linkedClient.error || !linkedClient.data?.id) {
          setError('Your account is not linked to an authorized client record.')
          await authClient.auth.signOut()
          if (transition === authTransitionSequence.current) setLoading(false)
          return
        }
        linkedClientId = linkedClient.data.id
      }

      const mfaRequirement = await getMfaRequirement()
      if (transition !== authTransitionSequence.current) return
      if (mfaRequirement.status === 'error') {
        setError(mfaDiscoveryError)
        await authClient.auth.signOut()
        if (transition === authTransitionSequence.current) setLoading(false)
        return
      }

      const factorId = mfaRequirement.status === 'challenge' ? mfaRequirement.factorId : null

      setError(null)
      setUser(nextUser)
      setDemoClientId(linkedClientId)
      setRole(nextRole)
      setMfaFactorId(factorId)
      setMfaChallengeRequired(Boolean(factorId))
      setLoading(false)
    }

    const { data: subscription } = authClient.auth.onAuthStateChange((_event, session) => {
      void loadRole(session?.user ?? null)
    })
    return () => subscription.subscription.unsubscribe()
  }, [clearConnectedCache])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      role,
      user,
      demoClientId,
      demoTherapistId,
      mfaChallengeRequired,
      error,
      async signIn({ identifier, password, expectedRole }) {
        setError(null)
        if (!supabase) return false
        const isEmail = identifier.includes('@')
        let authenticatedUserId: string | null = null
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
          authenticatedUserId = session.data.user?.id ?? null
        } else {
          const response = await supabase.auth.signInWithPassword({ email: identifier, password })
          if (response.error) {
            setError('The sign-in details could not be verified.')
            return false
          }
          authenticatedUserId = response.data.user?.id ?? null
        }
        if (!authenticatedUserId) {
          await supabase.auth.signOut()
          setError('The sign-in details could not be verified.')
          return false
        }
        const authorizedProfile = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authenticatedUserId)
          .maybeSingle()
        if (authorizedProfile.error || authorizedProfile.data?.role !== expectedRole) {
          await supabase.auth.signOut()
          setError('This account belongs to a different AURA portal.')
          return false
        }
        const mfaRequirement = await getMfaRequirement()
        if (mfaRequirement.status === 'error') {
          await supabase.auth.signOut()
          setError(mfaDiscoveryError)
          return false
        }
        if (mfaRequirement.status === 'challenge') {
          setMfaFactorId(mfaRequirement.factorId)
          setMfaChallengeRequired(true)
          return false
        }
        return true
      },
      async verifyMfa(code) {
        setError(null)
        if (!supabase) return false
        let factorId = mfaFactorId
        if (!factorId) {
          const mfaRequirement = await getMfaRequirement()
          if (mfaRequirement.status === 'error') {
            setError(mfaDiscoveryError)
            return false
          }
          factorId = mfaRequirement.status === 'challenge' ? mfaRequirement.factorId : null
        }
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
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}${env.basePath}#/auth/callback`,
          },
        })
        if (response.error) {
          setError('A sign-in link could not be sent.')
          return false
        }
        return true
      },
      enterDemo(nextRole, profileId) {
        const session = {
          role: nextRole,
          clientId: nextRole === 'client' ? (profileId ?? 'demo-client-mira') : null,
          therapistId: nextRole === 'therapist' ? (profileId ?? 'demo-therapist-amara') : null,
        }
        sessionStorage.setItem(sessionKey, JSON.stringify(session))
        setRole(nextRole)
        setDemoClientId(session.clientId)
        setDemoTherapistId(session.therapistId)
        setError(null)
      },
      async signOut() {
        const transition = ++authTransitionSequence.current
        previousAuthUserId.current = null
        sessionStorage.removeItem(sessionKey)
        setLoading(true)
        setRole(null)
        setUser(null)
        setDemoClientId(null)
        setDemoTherapistId(null)
        setMfaChallengeRequired(false)
        setMfaFactorId(null)
        await clearConnectedCache()
        if (supabase) await supabase.auth.signOut({ scope: 'global' })
        if (transition === authTransitionSequence.current) setLoading(false)
      },
    }),
    [
      clearConnectedCache,
      demoClientId,
      demoTherapistId,
      error,
      loading,
      mfaChallengeRequired,
      mfaFactorId,
      role,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
