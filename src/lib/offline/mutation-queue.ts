export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }
export type JsonObject = { readonly [key: string]: JsonValue }

export type OfflineMutationStatus = 'queued' | 'syncing' | 'retry_wait' | 'failed' | 'synced'

const OFFLINE_MUTATION_STATUSES = new Set<OfflineMutationStatus>([
  'queued',
  'syncing',
  'retry_wait',
  'failed',
  'synced',
])

const OFFLINE_MUTATION_KEYS = new Set([
  'id',
  'ownerKey',
  'idempotencyKey',
  'mutationType',
  'payload',
  'createdAt',
  'updatedAt',
  'retryCount',
  'status',
  'nextAttemptAt',
  'lastErrorCode',
])

export interface OfflineMutation<TPayload extends JsonObject = JsonObject> {
  readonly id: string
  readonly ownerKey: string
  readonly idempotencyKey: string
  readonly mutationType: string
  readonly payload: TPayload
  readonly createdAt: string
  readonly updatedAt: string
  readonly retryCount: number
  readonly status: OfflineMutationStatus
  readonly nextAttemptAt: string | null
  readonly lastErrorCode: string | null
}

export interface NewOfflineMutation<TPayload extends JsonObject = JsonObject> {
  readonly id: string
  readonly ownerKey: string
  readonly idempotencyKey?: string
  readonly mutationType: string
  readonly payload: TPayload
  readonly createdAt?: string | Date
}

export interface OfflineRetryConfig {
  readonly maximumRetries: number
  readonly baseDelayMs: number
  readonly maximumDelayMs: number
}

export interface OfflineMutationSyncResult {
  readonly id: string
  readonly outcome: 'synced' | 'retryable_error' | 'permanent_error'
  readonly errorCode?: string
}

export const DEFAULT_OFFLINE_RETRY_CONFIG: OfflineRetryConfig = {
  maximumRetries: 5,
  baseDelayMs: 2_000,
  maximumDelayMs: 5 * 60_000,
}

const UNSAFE_KEY_PARTS = [
  'password',
  'accesstoken',
  'refreshtoken',
  'servicerole',
  'authorization',
  'signedurl',
  'photograph',
  'photo',
  'imageblob',
  'voicenote',
  'audio',
  'transcript',
  'pdf',
] as const

function parseTime(value: string | Date): number | null {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isoTime(value: string | Date, label: string): string {
  const parsed = parseTime(value)
  if (parsed == null) throw new RangeError(`${label} must be a valid timestamp.`)
  return new Date(parsed).toISOString()
}

function assertIdentifier(value: string, label: string): void {
  if (value.trim().length === 0 || value.length > 200) {
    throw new TypeError(`${label} must be a non-empty, bounded string.`)
  }
}

function normalizeKey(key: string): string {
  return key.toLocaleLowerCase().replaceAll(/[^a-z0-9]/g, '')
}

function isUnsafeKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return normalized.includes('token') || UNSAFE_KEY_PARTS.some((part) => normalized.includes(part))
}

function inspectPayload(
  value: unknown,
  path: string,
  issues: string[],
  ancestors: Set<object>,
): void {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') {
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) issues.push(path)
    return
  }
  if (typeof value !== 'object') {
    issues.push(path)
    return
  }
  if (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  ) {
    issues.push(path)
    return
  }
  if (ancestors.has(value)) {
    issues.push(path)
    return
  }

  ancestors.add(value)
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      inspectPayload(item, `${path}[${index}]`, issues, ancestors)
    }
  } else {
    const prototype = Object.getPrototypeOf(value) as object | null
    if (prototype !== Object.prototype && prototype !== null) {
      issues.push(path)
      ancestors.delete(value)
      return
    }
    for (const [key, item] of Object.entries(value)) {
      const itemPath = `${path}.${key}`
      if (isUnsafeKey(key)) {
        issues.push(itemPath)
      } else {
        inspectPayload(item, itemPath, issues, ancestors)
      }
    }
  }
  ancestors.delete(value)
}

export function findUnsafeOfflinePayloadPaths(payload: unknown): readonly string[] {
  const issues: string[] = []
  inspectPayload(payload, '$', issues, new Set<object>())
  return issues
}

export function assertOfflinePayloadSafe(payload: unknown): void {
  const unsafePaths = findUnsafeOfflinePayloadPaths(payload)
  if (unsafePaths.length > 0) {
    throw new TypeError(
      `Offline payload contains unsupported or sensitive data at: ${unsafePaths.join(', ')}`,
    )
  }
}

export function createMutationId(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const id = randomUuid()
  assertIdentifier(id, 'Generated mutation id')
  return id
}

export function enqueueOfflineMutation<TPayload extends JsonObject>(
  queue: readonly OfflineMutation[],
  input: NewOfflineMutation<TPayload>,
  now: string | Date = new Date(),
): readonly OfflineMutation[] {
  assertIdentifier(input.id, 'Mutation id')
  assertIdentifier(input.ownerKey, 'Mutation owner key')
  assertIdentifier(input.mutationType, 'Mutation type')
  const idempotencyKey = input.idempotencyKey ?? input.id
  assertIdentifier(idempotencyKey, 'Idempotency key')
  assertOfflinePayloadSafe(input.payload)

  const duplicateId = queue.find((mutation) => mutation.id === input.id)
  if (duplicateId != null) {
    if (
      duplicateId.idempotencyKey === idempotencyKey &&
      duplicateId.ownerKey === input.ownerKey &&
      duplicateId.mutationType === input.mutationType
    ) {
      return queue
    }
    throw new TypeError(`Offline mutation id is already in use: ${input.id}`)
  }
  if (
    queue.some(
      (mutation) =>
        mutation.ownerKey === input.ownerKey && mutation.idempotencyKey === idempotencyKey,
    )
  ) {
    return queue
  }

  const createdAt = isoTime(input.createdAt ?? now, 'Created time')
  const updatedAt = isoTime(now, 'Current time')
  if (Date.parse(createdAt) > Date.parse(updatedAt)) {
    throw new RangeError('Mutation creation time cannot be in the future.')
  }
  return [
    ...queue,
    {
      id: input.id,
      ownerKey: input.ownerKey,
      idempotencyKey,
      mutationType: input.mutationType,
      payload: input.payload,
      createdAt,
      updatedAt,
      retryCount: 0,
      status: 'queued',
      nextAttemptAt: null,
      lastErrorCode: null,
    },
  ]
}

function updateMutation(
  queue: readonly OfflineMutation[],
  ownerKey: string,
  id: string,
  updater: (mutation: OfflineMutation) => OfflineMutation,
): readonly OfflineMutation[] {
  let found = false
  const updated = queue.map((mutation) => {
    if (mutation.id !== id || mutation.ownerKey !== ownerKey) return mutation
    found = true
    return updater(mutation)
  })
  if (!found) throw new RangeError(`Offline mutation was not found: ${id}`)
  return updated
}

export function getReadyOfflineMutations(
  queue: readonly OfflineMutation[],
  ownerKey: string,
  now: string | Date = new Date(),
  limit = Number.POSITIVE_INFINITY,
): readonly OfflineMutation[] {
  const nowTime = parseTime(now)
  assertIdentifier(ownerKey, 'Mutation owner key')
  if (nowTime == null) throw new RangeError('Current time must be valid.')
  if (!(limit === Number.POSITIVE_INFINITY || Number.isSafeInteger(limit)) || limit < 0) {
    throw new RangeError('Queue limit must be a non-negative integer.')
  }
  return queue
    .filter((mutation) => {
      if (mutation.ownerKey !== ownerKey) return false
      if (mutation.status === 'queued') return true
      if (mutation.status !== 'retry_wait' || mutation.nextAttemptAt == null) {
        return false
      }
      const dueAt = parseTime(mutation.nextAttemptAt)
      return dueAt != null && dueAt <= nowTime
    })
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id),
    )
    .slice(0, limit)
}

export function markOfflineMutationSyncing(
  queue: readonly OfflineMutation[],
  ownerKey: string,
  id: string,
  now: string | Date = new Date(),
): readonly OfflineMutation[] {
  const updatedAt = isoTime(now, 'Current time')
  const nowTime = Date.parse(updatedAt)
  return updateMutation(queue, ownerKey, id, (mutation) => {
    if (mutation.status !== 'queued' && mutation.status !== 'retry_wait') {
      throw new TypeError(`Mutation ${id} is not ready to sync.`)
    }
    if (
      mutation.status === 'retry_wait' &&
      mutation.nextAttemptAt != null &&
      Date.parse(mutation.nextAttemptAt) > nowTime
    ) {
      throw new TypeError(`Mutation ${id} has not reached its next retry time.`)
    }
    return {
      ...mutation,
      status: 'syncing',
      updatedAt,
      nextAttemptAt: null,
    }
  })
}

function assertErrorCode(errorCode: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(errorCode)) {
    throw new TypeError('Queue errors must use a privacy-safe machine error code.')
  }
}

function validateRetryConfig(config: OfflineRetryConfig): void {
  if (!Number.isSafeInteger(config.maximumRetries) || config.maximumRetries < 0) {
    throw new RangeError('Maximum retries must be a non-negative integer.')
  }
  if (!Number.isFinite(config.baseDelayMs) || config.baseDelayMs < 0) {
    throw new RangeError('Base retry delay must be finite and non-negative.')
  }
  if (!Number.isFinite(config.maximumDelayMs) || config.maximumDelayMs < config.baseDelayMs) {
    throw new RangeError('Maximum retry delay must be at least the base delay.')
  }
}

export function markOfflineMutationFailed(
  queue: readonly OfflineMutation[],
  ownerKey: string,
  id: string,
  errorCode: string,
  retryable: boolean,
  now: string | Date = new Date(),
  config: OfflineRetryConfig = DEFAULT_OFFLINE_RETRY_CONFIG,
): readonly OfflineMutation[] {
  assertErrorCode(errorCode)
  validateRetryConfig(config)
  const nowTime = parseTime(now)
  if (nowTime == null) throw new RangeError('Current time must be valid.')
  const updatedAt = new Date(nowTime).toISOString()

  return updateMutation(queue, ownerKey, id, (mutation) => {
    const retryCount = mutation.retryCount + 1
    const willRetry = retryable && retryCount <= config.maximumRetries
    const delay = Math.min(
      config.baseDelayMs * 2 ** Math.max(0, retryCount - 1),
      config.maximumDelayMs,
    )
    return {
      ...mutation,
      retryCount,
      status: willRetry ? 'retry_wait' : 'failed',
      updatedAt,
      nextAttemptAt: willRetry ? new Date(nowTime + delay).toISOString() : null,
      lastErrorCode: errorCode,
    }
  })
}

export function markOfflineMutationSynced(
  queue: readonly OfflineMutation[],
  ownerKey: string,
  id: string,
  now: string | Date = new Date(),
): readonly OfflineMutation[] {
  const updatedAt = isoTime(now, 'Current time')
  return updateMutation(queue, ownerKey, id, (mutation) => ({
    ...mutation,
    status: 'synced',
    updatedAt,
    nextAttemptAt: null,
    lastErrorCode: null,
  }))
}

export function reconcileOfflineMutationResults(
  queue: readonly OfflineMutation[],
  ownerKey: string,
  results: readonly OfflineMutationSyncResult[],
  now: string | Date = new Date(),
  config: OfflineRetryConfig = DEFAULT_OFFLINE_RETRY_CONFIG,
): readonly OfflineMutation[] {
  const seen = new Set<string>()
  let nextQueue = queue
  for (const result of results) {
    if (seen.has(result.id)) {
      throw new TypeError(`Duplicate sync result for mutation: ${result.id}`)
    }
    seen.add(result.id)
    if (result.outcome === 'synced') {
      nextQueue = markOfflineMutationSynced(nextQueue, ownerKey, result.id, now)
      continue
    }
    const errorCode = result.errorCode ?? 'sync_failed'
    nextQueue = markOfflineMutationFailed(
      nextQueue,
      ownerKey,
      result.id,
      errorCode,
      result.outcome === 'retryable_error',
      now,
      config,
    )
  }
  return nextQueue
}

export function removeSyncedOfflineMutations(
  queue: readonly OfflineMutation[],
): readonly OfflineMutation[] {
  return queue.filter((mutation) => mutation.status !== 'synced')
}

export function removeOfflineMutationsForOwner(
  queue: readonly OfflineMutation[],
  ownerKey: string,
): readonly OfflineMutation[] {
  assertIdentifier(ownerKey, 'Mutation owner key')
  return queue.filter((mutation) => mutation.ownerKey !== ownerKey)
}

export function recoverInterruptedOfflineMutations(
  queue: readonly OfflineMutation[],
  ownerKey: string,
  now: string | Date = new Date(),
  config: OfflineRetryConfig = DEFAULT_OFFLINE_RETRY_CONFIG,
): readonly OfflineMutation[] {
  let recovered = queue
  for (const mutation of queue) {
    if (mutation.ownerKey === ownerKey && mutation.status === 'syncing') {
      recovered = markOfflineMutationFailed(
        recovered,
        ownerKey,
        mutation.id,
        'sync_interrupted',
        true,
        now,
        config,
      )
    }
  }
  return recovered
}

export function isOfflineMutation(value: unknown): value is OfflineMutation {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (
    Object.keys(candidate).length !== OFFLINE_MUTATION_KEYS.size ||
    !Object.keys(candidate).every((key) => OFFLINE_MUTATION_KEYS.has(key)) ||
    typeof candidate.id !== 'string' ||
    candidate.id.length === 0 ||
    typeof candidate.ownerKey !== 'string' ||
    candidate.ownerKey.length === 0 ||
    typeof candidate.idempotencyKey !== 'string' ||
    candidate.idempotencyKey.length === 0 ||
    typeof candidate.mutationType !== 'string' ||
    candidate.mutationType.length === 0 ||
    candidate.payload == null ||
    typeof candidate.payload !== 'object' ||
    Array.isArray(candidate.payload) ||
    typeof candidate.createdAt !== 'string' ||
    parseTime(candidate.createdAt) == null ||
    typeof candidate.updatedAt !== 'string' ||
    parseTime(candidate.updatedAt) == null ||
    typeof candidate.retryCount !== 'number' ||
    !Number.isSafeInteger(candidate.retryCount) ||
    candidate.retryCount < 0 ||
    typeof candidate.status !== 'string' ||
    !OFFLINE_MUTATION_STATUSES.has(candidate.status as OfflineMutationStatus) ||
    !(
      candidate.nextAttemptAt === null ||
      (typeof candidate.nextAttemptAt === 'string' && parseTime(candidate.nextAttemptAt) != null)
    ) ||
    !(
      candidate.lastErrorCode === null ||
      (typeof candidate.lastErrorCode === 'string' &&
        /^[a-z0-9][a-z0-9._-]{0,79}$/u.test(candidate.lastErrorCode))
    )
  ) {
    return false
  }
  if (candidate.status === 'retry_wait' && candidate.nextAttemptAt == null) {
    return false
  }
  if (candidate.status !== 'retry_wait' && candidate.nextAttemptAt != null) {
    return false
  }
  if (
    (candidate.status === 'retry_wait' || candidate.status === 'failed') &&
    candidate.lastErrorCode == null
  ) {
    return false
  }
  if (
    (candidate.status === 'queued' || candidate.status === 'synced') &&
    candidate.lastErrorCode != null
  ) {
    return false
  }
  if (Date.parse(candidate.createdAt) > Date.parse(candidate.updatedAt)) {
    return false
  }
  return findUnsafeOfflinePayloadPaths(candidate.payload).length === 0
}
