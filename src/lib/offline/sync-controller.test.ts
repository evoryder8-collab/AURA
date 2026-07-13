import { describe, expect, it } from 'vitest'

import type { ConnectivityMonitor } from './connectivity'
import { createMinimalPendingSessionState, createPendingSessionStorage } from './index'
import {
  enqueueOfflineMutation,
  markOfflineMutationSyncing,
  type OfflineMutation,
} from './mutation-queue'
import { createOfflineMutationStorage } from './storage'
import {
  OfflineSyncController,
  type OfflineMutationTransport,
  type OfflineSendResult,
  type OfflineSyncScheduler,
} from './sync-controller'

const OWNER = 'owner-1'
const START = Date.parse('2026-07-13T12:00:00.000Z')

class FakeConnectivity implements ConnectivityMonitor {
  online = false
  readonly listeners = new Set<(online: boolean) => void>()

  isOnline() {
    return this.online
  }

  subscribe(listener: (online: boolean) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setOnline(online: boolean) {
    this.online = online
    for (const listener of this.listeners) listener(online)
  }
}

class ManualScheduler implements OfflineSyncScheduler {
  readonly tasks = new Map<number, { readonly callback: () => void; readonly delayMs: number }>()
  #nextId = 1

  set(callback: () => void, delayMs: number): number {
    const id = this.#nextId
    this.#nextId += 1
    this.tasks.set(id, { callback, delayMs })
    return id
  }

  clear(handle: unknown): void {
    if (typeof handle === 'number') this.tasks.delete(handle)
  }

  runNext(): number {
    const entry = [...this.tasks.entries()].sort(([left], [right]) => left - right)[0]
    if (entry == null) throw new Error('No scheduled task is available.')
    const [id, task] = entry
    this.tasks.delete(id)
    task.callback()
    return task.delayMs
  }
}

function input(id: string, ownerKey = OWNER) {
  return {
    id,
    ownerKey,
    idempotencyKey: `idempotency-${id}`,
    mutationType: 'session.finished',
    payload: { appointmentId: 'appointment-1' },
  } as const
}

function setup(send: OfflineMutationTransport['send'], connectivity = new FakeConnectivity()) {
  let nowMs = START
  const scheduler = new ManualScheduler()
  const storage = createOfflineMutationStorage({ forceMemory: true })
  const pending = createPendingSessionStorage({ forceMemory: true })
  const controller = new OfflineSyncController({
    storage,
    pendingSessionStorage: pending,
    connectivity,
    scheduler,
    now: () => new Date(nowMs),
    retryConfig: {
      maximumRetries: 2,
      baseDelayMs: 100,
      maximumDelayMs: 1_000,
    },
    transport: { send },
  })
  return {
    connectivity,
    controller,
    pending,
    scheduler,
    storage,
    advance(milliseconds: number) {
      nowMs += milliseconds
    },
  }
}

describe('OfflineSyncController', () => {
  it('drains persisted writes in creation order when the browser comes online', async () => {
    const sent: OfflineMutation[] = []
    const context = setup(async (mutation) => {
      sent.push(mutation)
      return { outcome: 'synced' }
    })
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.enqueue(input('mutation-1'))
    await context.controller.enqueue(input('mutation-2'))
    expect(await context.storage.load(OWNER)).toHaveLength(2)

    context.connectivity.setOnline(true)
    await context.controller.drainOwner(OWNER)

    expect(sent.map((mutation) => mutation.id)).toEqual(['mutation-1', 'mutation-2'])
    expect(sent.map((mutation) => mutation.idempotencyKey)).toEqual([
      'idempotency-mutation-1',
      'idempotency-mutation-2',
    ])
    expect(await context.storage.load(OWNER)).toEqual([])
    expect(await context.controller.getSnapshot(OWNER)).toMatchObject({
      status: 'idle',
      pendingCount: 0,
      failedCount: 0,
    })
  })

  it('retries a transient failure with the same idempotency key', async () => {
    const sentKeys: string[] = []
    const context = setup(async (mutation) => {
      sentKeys.push(mutation.idempotencyKey)
      return sentKeys.length === 1
        ? { outcome: 'retryable_error', errorCode: 'network_unavailable' }
        : { outcome: 'synced' }
    })
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.enqueue(input('mutation-1'))
    context.connectivity.online = true

    await context.controller.drainOwner(OWNER)
    expect((await context.storage.load(OWNER))[0]).toMatchObject({
      status: 'retry_wait',
      retryCount: 1,
      lastErrorCode: 'network_unavailable',
    })
    expect(context.scheduler.tasks.size).toBe(1)

    const delay = context.scheduler.runNext()
    context.advance(delay)
    await context.controller.drainOwner(OWNER)

    expect(sentKeys).toEqual(['idempotency-mutation-1', 'idempotency-mutation-1'])
    expect(await context.storage.load(OWNER)).toEqual([])
  })

  it('retains a permanent failure with a visible failed status', async () => {
    const context = setup(async () => ({
      outcome: 'permanent_error',
      errorCode: 'validation_rejected',
    }))
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.enqueue(input('mutation-1'))
    context.connectivity.online = true
    await context.controller.drainOwner(OWNER)

    expect((await context.storage.load(OWNER))[0]).toMatchObject({
      status: 'failed',
      lastErrorCode: 'validation_rejected',
    })
    expect(await context.controller.getSnapshot(OWNER)).toMatchObject({
      status: 'failed',
      pendingCount: 0,
      failedCount: 1,
    })
  })

  it('stores only a privacy-safe error code when the transport throws', async () => {
    const context = setup(async () => {
      throw new Error('Sensitive remote error content')
    })
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.enqueue(input('mutation-1'))
    context.connectivity.online = true
    await context.controller.drainOwner(OWNER)

    const stored = (await context.storage.load(OWNER))[0]
    expect(stored?.lastErrorCode).toBe('transport_error')
    expect(JSON.stringify(stored)).not.toContain('Sensitive remote error content')
  })

  it('replaces a malformed transport response with a safe retry code', async () => {
    const context = setup(
      async () =>
        ({
          outcome: 'unexpected_remote_value',
          errorCode: 'Remote response for a named client',
        }) as never,
    )
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.enqueue(input('mutation-1'))
    context.connectivity.online = true
    await context.controller.drainOwner(OWNER)

    const stored = (await context.storage.load(OWNER))[0]
    expect(stored?.lastErrorCode).toBe('transport_invalid_response')
    expect(JSON.stringify(stored)).not.toContain('named client')
  })

  it('coalesces concurrent drains so a mutation is sent once', async () => {
    const deferred: {
      resolve: ((result: OfflineSendResult) => void) | null
    } = { resolve: null }
    let signalStarted: (() => void) | null = null
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve
    })
    let calls = 0
    const context = setup(async () => {
      calls += 1
      signalStarted?.()
      return new Promise<OfflineSendResult>((resolve) => {
        deferred.resolve = resolve
      })
    })
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.enqueue(input('mutation-1'))
    context.connectivity.online = true

    const first = context.controller.drainOwner(OWNER)
    const second = context.controller.drainOwner(OWNER)
    await started
    expect(calls).toBe(1)
    const resolveSend = deferred.resolve
    if (resolveSend == null) throw new Error('Transport did not start.')
    resolveSend({ outcome: 'synced' })
    await Promise.all([first, second])

    expect(calls).toBe(1)
    expect(await context.storage.load(OWNER)).toEqual([])
  })

  it('recovers a persisted syncing mutation after an interrupted run', async () => {
    let calls = 0
    const context = setup(async () => {
      calls += 1
      return { outcome: 'synced' }
    })
    let queue = enqueueOfflineMutation([], input('mutation-1'), new Date(START))
    queue = markOfflineMutationSyncing(queue, OWNER, 'mutation-1', new Date(START))
    await context.storage.save(OWNER, queue)
    context.connectivity.online = true
    context.controller.start()

    await context.controller.activateOwner(OWNER)
    expect(calls).toBe(0)
    expect((await context.storage.load(OWNER))[0]).toMatchObject({
      status: 'retry_wait',
      lastErrorCode: 'sync_interrupted',
    })

    const delay = context.scheduler.runNext()
    context.advance(delay)
    await context.controller.drainOwner(OWNER)
    expect(calls).toBe(1)
    expect(await context.storage.load(OWNER)).toEqual([])
  })

  it('aborts an in-flight send and clears queue/session state on sign-out', async () => {
    let signalStarted: (() => void) | null = null
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve
    })
    const context = setup(
      (_mutation, { signal }) =>
        new Promise<OfflineSendResult>((_resolve, reject) => {
          signalStarted?.()
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    await context.pending.save(
      OWNER,
      createMinimalPendingSessionState({
        sessionId: 'session-1',
        appointmentId: 'appointment-1',
        startedAt: new Date(START).toISOString(),
        updatedAt: new Date(START).toISOString(),
        elapsedSeconds: 0,
        paused: false,
        selectedRegionIds: ['left-shoulder'],
      }),
    )
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.enqueue(input('mutation-1'))
    context.connectivity.online = true
    const draining = context.controller.drainOwner(OWNER)
    await started

    await context.controller.clearOwner(OWNER)
    await draining

    expect(await context.storage.load(OWNER)).toEqual([])
    expect(await context.pending.load(OWNER, 'appointment-1')).toBeNull()
    await context.controller.drainOwner(OWNER)
    expect(await context.storage.load(OWNER)).toEqual([])
  })

  it('keeps another owner intact when one owner signs out', async () => {
    const context = setup(async () => ({ outcome: 'synced' }))
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.activateOwner('owner-2')
    await context.controller.enqueue(input('mutation-1'))
    await context.controller.enqueue(input('mutation-2', 'owner-2'))

    await context.controller.clearOwner(OWNER)
    expect(await context.storage.load(OWNER)).toEqual([])
    expect(await context.storage.load('owner-2')).toHaveLength(1)
  })

  it('rejects stale writes after an owner signs out', async () => {
    const context = setup(async () => ({ outcome: 'synced' }))
    context.controller.start()
    await context.controller.activateOwner(OWNER)
    await context.controller.clearOwner(OWNER)

    await expect(context.controller.enqueue(input('mutation-after-signout'))).rejects.toThrow(
      'Offline queue owner is not active.',
    )
    expect(await context.storage.load(OWNER)).toEqual([])
  })
})
