export const PENDING_SESSION_STATE_VERSION = 1

export interface MinimalPendingSessionState {
  readonly version: typeof PENDING_SESSION_STATE_VERSION
  readonly sessionId: string
  readonly appointmentId: string
  readonly startedAt: string
  readonly updatedAt: string
  readonly elapsedSeconds: number
  readonly paused: boolean
  readonly selectedRegionIds: readonly string[]
}

const PENDING_SESSION_KEYS = new Set([
  'version',
  'sessionId',
  'appointmentId',
  'startedAt',
  'updatedAt',
  'elapsedSeconds',
  'paused',
  'selectedRegionIds',
])

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

export function isMinimalPendingSessionState(value: unknown): value is MinimalPendingSessionState {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    Object.keys(candidate).every((key) => PENDING_SESSION_KEYS.has(key)) &&
    Object.keys(candidate).length === PENDING_SESSION_KEYS.size &&
    candidate.version === PENDING_SESSION_STATE_VERSION &&
    typeof candidate.sessionId === 'string' &&
    candidate.sessionId.length > 0 &&
    typeof candidate.appointmentId === 'string' &&
    candidate.appointmentId.length > 0 &&
    typeof candidate.startedAt === 'string' &&
    validTimestamp(candidate.startedAt) &&
    typeof candidate.updatedAt === 'string' &&
    validTimestamp(candidate.updatedAt) &&
    typeof candidate.elapsedSeconds === 'number' &&
    Number.isSafeInteger(candidate.elapsedSeconds) &&
    candidate.elapsedSeconds >= 0 &&
    typeof candidate.paused === 'boolean' &&
    Array.isArray(candidate.selectedRegionIds) &&
    candidate.selectedRegionIds.every(
      (regionId) => typeof regionId === 'string' && regionId.length > 0,
    )
  )
}

export function createMinimalPendingSessionState(
  input: Omit<MinimalPendingSessionState, 'version'>,
): MinimalPendingSessionState {
  const candidate = { ...input, version: PENDING_SESSION_STATE_VERSION } as const
  if (!isMinimalPendingSessionState(candidate)) {
    throw new TypeError('Pending session state is invalid or contains extra detail.')
  }
  return candidate
}
