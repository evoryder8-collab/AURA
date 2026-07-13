export interface HandoffState {
  status: string
  expiresAt: string | null
  revokedAt: string | null
  hasConsent: boolean
  hasApproval: boolean
  hasStoragePath: boolean
}

export function handoffStateIsUsable(state: HandoffState, now = Date.now()): boolean {
  return (
    state.status === 'shared' &&
    !state.revokedAt &&
    !!state.expiresAt &&
    Date.parse(state.expiresAt) > now &&
    state.hasConsent &&
    state.hasApproval &&
    state.hasStoragePath
  )
}
