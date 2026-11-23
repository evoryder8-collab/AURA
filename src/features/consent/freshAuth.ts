import { create } from 'zustand'
import type { DemoClient } from '@/data/demo/model'
import { useDemoStore } from '@/data/demo/store'
import { therapistCanAccessClient } from '@/data/demo/team'
import { evaluateConsentGuard, type ConsentProtectedAction } from '@/domain/rules'
import { useAuth } from '@/features/auth/auth-context'
import { demoConsentRecords } from '@/lib/security/demoConsent'

type FreshAuthStore = {
  confirmedAt: Record<string, string>
  confirm: (actorKey: string) => void
}

/**
 * Demo stand-in for signing in again before sensitive actions. Memory only and keyed by
 * the signed-in account, so a reload or a different account starts unconfirmed.
 */
export const useFreshAuthStore = create<FreshAuthStore>()((set) => ({
  confirmedAt: {},
  confirm: (actorKey) =>
    set((state) => ({
      confirmedAt: { ...state.confirmedAt, [actorKey]: new Date().toISOString() },
    })),
}))

export function useFreshAuth() {
  const auth = useAuth()
  const actorKey = `${auth.role ?? 'none'}:${(auth.role === 'therapist' ? auth.demoTherapistId : auth.demoClientId) ?? 'none'}`
  const at = useFreshAuthStore((state) => state.confirmedAt[actorKey] ?? null)
  const confirmFor = useFreshAuthStore((state) => state.confirm)
  return { at, confirm: () => confirmFor(actorKey) }
}

/**
 * Runs the shared consent guard for the signed-in demo account against one client.
 * Returns a function so callers can re-check at the moment they act, not only at render.
 */
export function useConsentGuard(client: DemoClient) {
  const auth = useAuth()
  const therapists = useDemoStore((state) => state.therapists)
  const { at } = useFreshAuth()
  return (action: ConsentProtectedAction) => {
    const actorRole = auth.role === 'therapist' ? 'therapist' : 'client'
    return evaluateConsentGuard({
      action,
      actorRole,
      actorClientId: actorRole === 'client' ? auth.demoClientId : null,
      targetClientId: client.id,
      ...(actorRole === 'therapist'
        ? {
            therapistCanAccessClient: therapistCanAccessClient(
              { therapists },
              auth.demoTherapistId,
              client.id,
            ),
          }
        : {}),
      consents: demoConsentRecords(client),
      freshAuthenticationAt: at,
    })
  }
}
