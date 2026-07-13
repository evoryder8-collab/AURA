import { createBrowserConnectivityMonitor, type ConnectivityMonitor } from './connectivity'
import {
  DEFAULT_OFFLINE_RETRY_CONFIG,
  enqueueOfflineMutation,
  getReadyOfflineMutations,
  markOfflineMutationSyncing,
  reconcileOfflineMutationResults,
  recoverInterruptedOfflineMutations,
  removeSyncedOfflineMutations,
  type NewOfflineMutation,
  type OfflineMutation,
  type OfflineMutationSyncResult,
  type OfflineRetryConfig,
} from './mutation-queue'
import type { PendingSessionStorage } from './pending-session-storage'
import type { OfflineMutationStorage } from './storage'

export type OfflineSendResult =
  | { readonly outcome: 'synced' }
  | {
      readonly outcome: 'retryable_error' | 'permanent_error'
      readonly errorCode: string
    }

export interface OfflineMutationTransport {
  send(
    mutation: OfflineMutation,
    context: { readonly signal: AbortSignal },
  ): Promise<OfflineSendResult>
}

export interface OfflineSyncScheduler {
  set(callback: () => void, delayMs: number): unknown
  clear(handle: unknown): void
}

export type OfflineSyncStatus = 'idle' | 'offline' | 'syncing' | 'retry_wait' | 'failed'

export interface OfflineSyncSnapshot {
  readonly ownerKey: string
  readonly status: OfflineSyncStatus
  readonly pendingCount: number
  readonly failedCount: number
  readonly nextAttemptAt: string | null
}

export interface OfflineSyncControllerOptions {
  readonly storage: OfflineMutationStorage
  readonly transport: OfflineMutationTransport
  readonly pendingSessionStorage?: PendingSessionStorage
  readonly connectivity?: ConnectivityMonitor
  readonly retryConfig?: OfflineRetryConfig
  readonly scheduler?: OfflineSyncScheduler
  readonly now?: () => Date
  readonly batchSize?: number
}

const machineErrorCode = /^[a-z0-9][a-z0-9._-]{0,79}$/u

const browserScheduler: OfflineSyncScheduler = {
  set(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs)
  },
  clear(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
  },
}

function validateBatchSize(batchSize: number): void {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError('Offline sync batch size must be a positive integer.')
  }
}

function pendingCount(queue: readonly OfflineMutation[]): number {
  return queue.filter(
    (mutation) =>
      mutation.status === 'queued' ||
      mutation.status === 'syncing' ||
      mutation.status === 'retry_wait',
  ).length
}

export class OfflineSyncController {
  readonly #storage: OfflineMutationStorage
  readonly #transport: OfflineMutationTransport
  readonly #pendingSessionStorage: PendingSessionStorage | undefined
  readonly #connectivity: ConnectivityMonitor
  readonly #retryConfig: OfflineRetryConfig
  readonly #scheduler: OfflineSyncScheduler
  readonly #now: () => Date
  readonly #batchSize: number
  readonly #activeOwners = new Set<string>()
  readonly #ownerEpochs = new Map<string, number>()
  readonly #operationChains = new Map<string, Promise<void>>()
  readonly #drains = new Map<string, Promise<void>>()
  readonly #retryTimers = new Map<string, unknown>()
  readonly #abortControllers = new Map<string, AbortController>()
  readonly #subscribers = new Set<(snapshot: OfflineSyncSnapshot) => void>()
  #unsubscribeConnectivity: (() => void) | null = null
  #started = false

  constructor(options: OfflineSyncControllerOptions) {
    this.#storage = options.storage
    this.#transport = options.transport
    this.#pendingSessionStorage = options.pendingSessionStorage
    this.#connectivity = options.connectivity ?? createBrowserConnectivityMonitor()
    this.#retryConfig = options.retryConfig ?? DEFAULT_OFFLINE_RETRY_CONFIG
    this.#scheduler = options.scheduler ?? browserScheduler
    this.#now = options.now ?? (() => new Date())
    this.#batchSize = options.batchSize ?? 10
    validateBatchSize(this.#batchSize)
  }

  start(): void {
    if (this.#started) return
    this.#started = true
    this.#unsubscribeConnectivity = this.#connectivity.subscribe((online) => {
      if (!online) {
        for (const ownerKey of this.#activeOwners) {
          this.#cancelRetry(ownerKey)
          this.#abortControllers.get(ownerKey)?.abort()
          void this.#refreshSnapshot(ownerKey)
        }
        return
      }
      for (const ownerKey of this.#activeOwners) {
        void this.drainOwner(ownerKey)
      }
    })
    if (this.#connectivity.isOnline()) {
      for (const ownerKey of this.#activeOwners) {
        void this.drainOwner(ownerKey)
      }
    }
  }

  stop(): void {
    this.#started = false
    this.#unsubscribeConnectivity?.()
    this.#unsubscribeConnectivity = null
    for (const ownerKey of this.#activeOwners) this.#cancelRetry(ownerKey)
    for (const controller of this.#abortControllers.values()) controller.abort()
  }

  subscribe(listener: (snapshot: OfflineSyncSnapshot) => void): () => void {
    this.#subscribers.add(listener)
    return () => this.#subscribers.delete(listener)
  }

  async activateOwner(ownerKey: string): Promise<void> {
    this.#activeOwners.add(ownerKey)
    await this.#refreshSnapshot(ownerKey)
    if (this.#started && this.#connectivity.isOnline()) {
      await this.drainOwner(ownerKey)
    }
  }

  async enqueue(input: NewOfflineMutation): Promise<void> {
    const ownerKey = input.ownerKey
    if (!this.#activeOwners.has(ownerKey)) {
      throw new Error('Offline queue owner is not active.')
    }
    const epoch = this.#epoch(ownerKey)
    await this.#exclusive(ownerKey, async () => {
      const current = await this.#storage.load(ownerKey)
      const next = enqueueOfflineMutation(current, input, this.#now())
      if (this.#epoch(ownerKey) !== epoch) return
      await this.#storage.save(ownerKey, next)
      this.#emitSnapshot(ownerKey, next)
    })
    if (this.#started && this.#connectivity.isOnline() && this.#epoch(ownerKey) === epoch) {
      void this.drainOwner(ownerKey)
    }
  }

  async drainOwner(ownerKey: string): Promise<void> {
    const existing = this.#drains.get(ownerKey)
    if (existing != null) return existing
    if (!this.#started || !this.#activeOwners.has(ownerKey)) return

    const epoch = this.#epoch(ownerKey)
    const drain = this.#exclusive(ownerKey, () => this.#drainLocked(ownerKey, epoch))
    this.#drains.set(ownerKey, drain)
    void this.#refreshSnapshot(ownerKey)
    try {
      await drain
    } finally {
      if (this.#drains.get(ownerKey) === drain) this.#drains.delete(ownerKey)
      await this.#refreshSnapshot(ownerKey)
    }
  }

  async getSnapshot(ownerKey: string): Promise<OfflineSyncSnapshot> {
    return this.#snapshot(ownerKey, await this.#storage.load(ownerKey))
  }

  async clearOwner(ownerKey: string): Promise<void> {
    this.#activeOwners.delete(ownerKey)
    this.#ownerEpochs.set(ownerKey, this.#epoch(ownerKey) + 1)
    this.#cancelRetry(ownerKey)
    this.#abortControllers.get(ownerKey)?.abort()

    await Promise.allSettled([
      this.#storage.clear(ownerKey),
      this.#pendingSessionStorage?.clear(ownerKey) ?? Promise.resolve(),
    ])
    await this.#exclusive(ownerKey, async () => {
      await Promise.all([
        this.#storage.clear(ownerKey),
        this.#pendingSessionStorage?.clear(ownerKey) ?? Promise.resolve(),
      ])
    })
    this.#emitSnapshot(ownerKey, [])
  }

  async #drainLocked(ownerKey: string, epoch: number): Promise<void> {
    if (!this.#activeOwners.has(ownerKey) || this.#epoch(ownerKey) !== epoch) {
      return
    }

    let queue = await this.#storage.load(ownerKey)
    const recovered = recoverInterruptedOfflineMutations(
      queue,
      ownerKey,
      this.#now(),
      this.#retryConfig,
    )
    if (recovered !== queue) {
      queue = recovered
      await this.#storage.save(ownerKey, queue)
    }
    if (!this.#connectivity.isOnline()) {
      this.#cancelRetry(ownerKey)
      this.#emitSnapshot(ownerKey, queue)
      return
    }

    const ready = getReadyOfflineMutations(queue, ownerKey, this.#now(), this.#batchSize)
    if (ready.length === 0) {
      this.#schedule(ownerKey, queue)
      this.#emitSnapshot(ownerKey, queue)
      return
    }

    const abortController = new AbortController()
    this.#abortControllers.set(ownerKey, abortController)
    try {
      for (const mutation of ready) {
        if (
          abortController.signal.aborted ||
          !this.#connectivity.isOnline() ||
          !this.#activeOwners.has(ownerKey) ||
          this.#epoch(ownerKey) !== epoch
        ) {
          break
        }

        queue = markOfflineMutationSyncing(queue, ownerKey, mutation.id, this.#now())
        await this.#storage.save(ownerKey, queue)
        this.#emitSnapshot(ownerKey, queue)

        const result = await this.#safeSend(mutation, abortController.signal)
        if (!this.#activeOwners.has(ownerKey) || this.#epoch(ownerKey) !== epoch) {
          return
        }

        queue = reconcileOfflineMutationResults(
          queue,
          ownerKey,
          [{ id: mutation.id, ...result }],
          this.#now(),
          this.#retryConfig,
        )
        if (result.outcome === 'synced') {
          queue = removeSyncedOfflineMutations(queue)
        }
        await this.#storage.save(ownerKey, queue)
        this.#emitSnapshot(ownerKey, queue)
      }
    } finally {
      if (this.#abortControllers.get(ownerKey) === abortController) {
        this.#abortControllers.delete(ownerKey)
      }
    }
    this.#schedule(ownerKey, queue)
  }

  async #safeSend(
    mutation: OfflineMutation,
    signal: AbortSignal,
  ): Promise<Omit<OfflineMutationSyncResult, 'id'>> {
    try {
      const result = await this.#transport.send(mutation, { signal })
      if (result != null && typeof result === 'object' && result.outcome === 'synced') {
        return { outcome: 'synced' }
      }
      if (
        result == null ||
        typeof result !== 'object' ||
        (result.outcome !== 'retryable_error' && result.outcome !== 'permanent_error') ||
        typeof result.errorCode !== 'string' ||
        !machineErrorCode.test(result.errorCode)
      ) {
        return {
          outcome: 'retryable_error',
          errorCode: 'transport_invalid_response',
        }
      }
      return result
    } catch {
      return {
        outcome: 'retryable_error',
        errorCode: signal.aborted ? 'transport_interrupted' : 'transport_error',
      }
    }
  }

  #schedule(ownerKey: string, queue: readonly OfflineMutation[]): void {
    this.#cancelRetry(ownerKey)
    if (!this.#activeOwners.has(ownerKey) || !this.#started || !this.#connectivity.isOnline()) {
      return
    }

    const now = this.#now()
    const ready = getReadyOfflineMutations(queue, ownerKey, now, 1)
    let delayMs: number | null = ready.length > 0 ? 0 : null
    if (delayMs == null) {
      const nextAttempt = queue
        .filter(
          (mutation) =>
            mutation.ownerKey === ownerKey &&
            mutation.status === 'retry_wait' &&
            mutation.nextAttemptAt != null,
        )
        .map((mutation) => Date.parse(mutation.nextAttemptAt!))
        .filter(Number.isFinite)
        .sort((left, right) => left - right)[0]
      if (nextAttempt != null) {
        delayMs = Math.max(0, nextAttempt - now.getTime())
      }
    }
    if (delayMs == null) return

    const handle = this.#scheduler.set(() => {
      if (this.#retryTimers.get(ownerKey) === handle) {
        this.#retryTimers.delete(ownerKey)
      }
      void this.drainOwner(ownerKey)
    }, delayMs)
    this.#retryTimers.set(ownerKey, handle)
  }

  #cancelRetry(ownerKey: string): void {
    const handle = this.#retryTimers.get(ownerKey)
    if (handle == null) return
    this.#scheduler.clear(handle)
    this.#retryTimers.delete(ownerKey)
  }

  #epoch(ownerKey: string): number {
    return this.#ownerEpochs.get(ownerKey) ?? 0
  }

  async #exclusive<T>(ownerKey: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#operationChains.get(ownerKey) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(operation)
    const tail = run.then(
      () => undefined,
      () => undefined,
    )
    this.#operationChains.set(ownerKey, tail)
    try {
      return await run
    } finally {
      if (this.#operationChains.get(ownerKey) === tail) {
        this.#operationChains.delete(ownerKey)
      }
    }
  }

  async #refreshSnapshot(ownerKey: string): Promise<void> {
    this.#emitSnapshot(ownerKey, await this.#storage.load(ownerKey))
  }

  #emitSnapshot(ownerKey: string, queue: readonly OfflineMutation[]): void {
    const snapshot = this.#snapshot(ownerKey, queue)
    for (const subscriber of this.#subscribers) {
      try {
        subscriber(snapshot)
      } catch {
        // One status consumer must not interrupt persistence or reconciliation.
      }
    }
  }

  #snapshot(ownerKey: string, queue: readonly OfflineMutation[]): OfflineSyncSnapshot {
    const pending = pendingCount(queue)
    const failed = queue.filter(
      (mutation) => mutation.ownerKey === ownerKey && mutation.status === 'failed',
    ).length
    const nextAttemptAt =
      queue
        .filter(
          (mutation) =>
            mutation.ownerKey === ownerKey &&
            mutation.status === 'retry_wait' &&
            mutation.nextAttemptAt != null,
        )
        .map((mutation) => mutation.nextAttemptAt!)
        .sort()[0] ?? null
    let status: OfflineSyncStatus = 'idle'
    if (!this.#connectivity.isOnline()) status = 'offline'
    else if (this.#drains.has(ownerKey)) status = 'syncing'
    else if (pending > 0) status = 'retry_wait'
    else if (failed > 0) status = 'failed'

    return {
      ownerKey,
      status,
      pendingCount: pending,
      failedCount: failed,
      nextAttemptAt,
    }
  }
}
