export const CONSENT_TYPES = [
  'health_data',
  'photography',
  'reminders',
  'handoff',
  'ai_processing',
] as const

export type ConsentType = (typeof CONSENT_TYPES)[number]
export type ActorRole = 'therapist' | 'client'

export interface ConsentRecord {
  readonly id: string
  readonly clientId: string
  readonly consentType: ConsentType
  readonly version: number
  readonly granted: boolean
  readonly grantedAt: string | null
  readonly revokedAt: string | null
  readonly expiresAt?: string | null
}

export const CONSENT_PROTECTED_ACTIONS = [
  'read_health_data',
  'create_photo',
  'view_photo',
  'send_reminder',
  'generate_handoff',
  'access_handoff',
  'process_with_ai',
  'change_consent',
  'export_data',
  'request_deletion',
] as const

export type ConsentProtectedAction = (typeof CONSENT_PROTECTED_ACTIONS)[number]

export type ConsentGuardReason =
  | 'allowed'
  | 'wrong_client'
  | 'client_access_not_authorized'
  | 'consent_missing_or_inactive'
  | 'fresh_authentication_required'
  | 'invalid_time_context'

export interface ConsentGuardContext {
  readonly action: ConsentProtectedAction
  readonly actorRole: ActorRole
  readonly actorClientId: string | null
  readonly targetClientId: string
  readonly therapistCanAccessClient?: boolean
  readonly consents: readonly ConsentRecord[]
  readonly freshAuthenticationAt: string | null
  readonly now?: string | Date
  readonly freshAuthenticationWindowMinutes?: number
}

export interface ConsentGuardResult {
  readonly allowed: boolean
  readonly reason: ConsentGuardReason
  readonly requiredConsent: ConsentType | null
  readonly activeConsentId: string | null
  readonly requiresFreshAuthentication: boolean
}

const REQUIRED_CONSENT: Readonly<Partial<Record<ConsentProtectedAction, ConsentType>>> = {
  read_health_data: 'health_data',
  create_photo: 'photography',
  view_photo: 'photography',
  send_reminder: 'reminders',
  generate_handoff: 'handoff',
  access_handoff: 'handoff',
  process_with_ai: 'ai_processing',
}

const FRESH_AUTH_ACTIONS = new Set<ConsentProtectedAction>([
  'create_photo',
  'view_photo',
  'generate_handoff',
  'access_handoff',
  'change_consent',
  'export_data',
  'request_deletion',
])

const DEFAULT_FRESH_AUTHENTICATION_WINDOW_MINUTES = 15

function parseTime(value: string | Date): number | null {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function consentEffectiveTime(consent: ConsentRecord): number {
  const grantedAt = consent.grantedAt == null ? null : parseTime(consent.grantedAt)
  const revokedAt = consent.revokedAt == null ? null : parseTime(consent.revokedAt)
  return Math.max(grantedAt ?? Number.NEGATIVE_INFINITY, revokedAt ?? Number.NEGATIVE_INFINITY)
}

export function getActiveConsent(
  consents: readonly ConsentRecord[],
  clientId: string,
  consentType: ConsentType,
  at: string | Date = new Date(),
): ConsentRecord | null {
  const atTime = parseTime(at)
  if (atTime == null) return null

  const candidates = consents
    .filter((consent) => consent.clientId === clientId && consent.consentType === consentType)
    .filter((consent) => consentEffectiveTime(consent) <= atTime)
    .sort(
      (left, right) =>
        right.version - left.version ||
        consentEffectiveTime(right) - consentEffectiveTime(left) ||
        right.id.localeCompare(left.id),
    )
  const latest = candidates[0]
  if (latest == null || !latest.granted || latest.grantedAt == null) return null

  const grantedAt = parseTime(latest.grantedAt)
  const revokedAt = latest.revokedAt == null ? null : parseTime(latest.revokedAt)
  const expiresAt = latest.expiresAt == null ? null : parseTime(latest.expiresAt)
  if (grantedAt == null || grantedAt > atTime) return null
  if (revokedAt == null && latest.revokedAt != null) return null
  if (revokedAt != null && revokedAt <= atTime) return null
  if (expiresAt == null && latest.expiresAt != null) return null
  if (expiresAt != null && expiresAt <= atTime) return null
  return latest
}

export function hasActiveConsent(
  consents: readonly ConsentRecord[],
  clientId: string,
  consentType: ConsentType,
  at: string | Date = new Date(),
): boolean {
  return getActiveConsent(consents, clientId, consentType, at) != null
}

function result(
  allowed: boolean,
  reason: ConsentGuardReason,
  requiredConsent: ConsentType | null,
  activeConsentId: string | null,
  requiresFreshAuthentication: boolean,
): ConsentGuardResult {
  return {
    allowed,
    reason,
    requiredConsent,
    activeConsentId,
    requiresFreshAuthentication,
  }
}

export function evaluateConsentGuard(context: ConsentGuardContext): ConsentGuardResult {
  const now = context.now ?? new Date()
  const nowTime = parseTime(now)
  const requiredConsent = REQUIRED_CONSENT[context.action] ?? null
  const requiresFreshAuthentication = FRESH_AUTH_ACTIONS.has(context.action)
  if (nowTime == null) {
    return result(false, 'invalid_time_context', requiredConsent, null, requiresFreshAuthentication)
  }

  if (context.actorRole === 'client' && context.actorClientId !== context.targetClientId) {
    return result(false, 'wrong_client', requiredConsent, null, requiresFreshAuthentication)
  }
  if (context.actorRole === 'therapist' && context.therapistCanAccessClient === false) {
    return result(
      false,
      'client_access_not_authorized',
      requiredConsent,
      null,
      requiresFreshAuthentication,
    )
  }

  const activeConsent =
    requiredConsent == null
      ? null
      : getActiveConsent(context.consents, context.targetClientId, requiredConsent, now)
  if (requiredConsent != null && activeConsent == null) {
    return result(
      false,
      'consent_missing_or_inactive',
      requiredConsent,
      null,
      requiresFreshAuthentication,
    )
  }

  if (requiresFreshAuthentication) {
    const windowMinutes =
      context.freshAuthenticationWindowMinutes ?? DEFAULT_FRESH_AUTHENTICATION_WINDOW_MINUTES
    if (!Number.isFinite(windowMinutes) || windowMinutes < 0) {
      return result(false, 'invalid_time_context', requiredConsent, activeConsent?.id ?? null, true)
    }
    const authenticatedAt =
      context.freshAuthenticationAt == null ? null : parseTime(context.freshAuthenticationAt)
    const maximumAge = windowMinutes * 60_000
    if (
      authenticatedAt == null ||
      authenticatedAt > nowTime ||
      nowTime - authenticatedAt > maximumAge
    ) {
      return result(
        false,
        'fresh_authentication_required',
        requiredConsent,
        activeConsent?.id ?? null,
        true,
      )
    }
  }

  return result(
    true,
    'allowed',
    requiredConsent,
    activeConsent?.id ?? null,
    requiresFreshAuthentication,
  )
}
