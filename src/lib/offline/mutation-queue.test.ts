import { describe, expect, it } from 'vitest'

import {
  createMutationId,
  enqueueOfflineMutation,
  findUnsafeOfflinePayloadPaths,
  getReadyOfflineMutations,
  markOfflineMutationFailed,
  markOfflineMutationSyncing,
  reconcileOfflineMutationResults,
  removeOfflineMutationsForOwner,
  removeSyncedOfflineMutations,
  type OfflineMutation,
} from './mutation-queue'

const NOW = '2026-07-13T12:00:00.000Z'
const OWNER = 'auth-user-1'

function queuedMutation(
  id = 'mutation-1',
  queue: readonly OfflineMutation[] = [],
): readonly OfflineMutation[] {
  return enqueueOfflineMutation(
    queue,
    {
      id,
      ownerKey: OWNER,
      mutationType: 'session.update_elapsed',
      payload: { sessionId: 'session-1', elapsedSeconds: 120 },
    },
    NOW,
  )
}

describe('offline mutation queue creation', () => {
  it('creates a clearly queued mutation with an idempotency key', () => {
    const queue = queuedMutation()
    expect(queue).toEqual([
      {
        id: 'mutation-1',
        ownerKey: OWNER,
        idempotencyKey: 'mutation-1',
        mutationType: 'session.update_elapsed',
        payload: { sessionId: 'session-1', elapsedSeconds: 120 },
        createdAt: NOW,
        updatedAt: NOW,
        retryCount: 0,
        status: 'queued',
        nextAttemptAt: null,
        lastErrorCode: null,
      },
    ])
  })

  it('allows injected, testable unique id generation', () => {
    expect(createMutationId(() => 'deterministic-uuid')).toBe('deterministic-uuid')
  })

  it('treats the same id/idempotency key as an idempotent enqueue', () => {
    const queue = queuedMutation()
    const duplicate = queuedMutation('mutation-1', queue)
    expect(duplicate).toBe(queue)
  })

  it('rejects mutation-id reuse with a different operation', () => {
    const queue = queuedMutation()
    expect(() =>
      enqueueOfflineMutation(
        queue,
        {
          id: 'mutation-1',
          ownerKey: OWNER,
          mutationType: 'different.operation',
          payload: { sessionId: 'session-1' },
        },
        NOW,
      ),
    ).toThrow(TypeError)
  })

  it('rejects a creation timestamp in the future', () => {
    expect(() =>
      enqueueOfflineMutation(
        [],
        {
          id: 'mutation-future',
          ownerKey: OWNER,
          mutationType: 'session.update_elapsed',
          payload: { sessionId: 'session-1', elapsedSeconds: 1 },
          createdAt: '2026-07-14T12:00:00.000Z',
        },
        NOW,
      ),
    ).toThrow(RangeError)
  })

  it('deduplicates a separately generated mutation with the same idempotency key', () => {
    const first = enqueueOfflineMutation(
      [],
      {
        id: 'mutation-1',
        ownerKey: OWNER,
        idempotencyKey: 'session-1:finish',
        mutationType: 'session.finish',
        payload: { sessionId: 'session-1' },
      },
      NOW,
    )
    const duplicate = enqueueOfflineMutation(
      first,
      {
        id: 'mutation-2',
        ownerKey: OWNER,
        idempotencyKey: 'session-1:finish',
        mutationType: 'session.finish',
        payload: { sessionId: 'session-1' },
      },
      NOW,
    )
    expect(duplicate).toBe(first)
  })
})

describe('offline payload privacy boundary', () => {
  it('rejects tokens, private media, transcripts, and binary values', () => {
    expect(findUnsafeOfflinePayloadPaths({ accessToken: 'secret' })).toEqual(['$.accessToken'])
    expect(findUnsafeOfflinePayloadPaths({ nested: { photoBlob: 'data' } })).toEqual([
      '$.nested.photoBlob',
    ])
    expect(findUnsafeOfflinePayloadPaths({ voiceTranscript: 'private' })).toEqual([
      '$.voiceTranscript',
    ])
    expect(findUnsafeOfflinePayloadPaths({ bytes: new Uint8Array([1]) })).toEqual(['$.bytes'])
    expect(findUnsafeOfflinePayloadPaths({ dateObject: new Date(NOW) })).toEqual(['$.dateObject'])
  })

  it('rejects unsafe payloads before persistence', () => {
    expect(() =>
      enqueueOfflineMutation(
        [],
        {
          id: 'mutation-secret',
          ownerKey: OWNER,
          mutationType: 'unsafe',
          payload: { refresh_token: 'do-not-store' },
        },
        NOW,
      ),
    ).toThrow(TypeError)
  })

  it('accepts minimal structured session state', () => {
    expect(
      findUnsafeOfflinePayloadPaths({
        sessionId: 'session-1',
        elapsedSeconds: 120,
        selectedRegionIds: ['left-shoulder'],
      }),
    ).toEqual([])
  })
})

describe('offline retry and reconciliation', () => {
  it('marks queued work syncing and schedules exponential retry', () => {
    const syncing = markOfflineMutationSyncing(queuedMutation(), OWNER, 'mutation-1', NOW)
    const firstFailure = markOfflineMutationFailed(
      syncing,
      OWNER,
      'mutation-1',
      'network_unavailable',
      true,
      NOW,
    )
    expect(firstFailure[0]).toMatchObject({
      retryCount: 1,
      status: 'retry_wait',
      nextAttemptAt: '2026-07-13T12:00:02.000Z',
      lastErrorCode: 'network_unavailable',
    })
    expect(getReadyOfflineMutations(firstFailure, OWNER, '2026-07-13T12:00:01.999Z')).toEqual([])
    expect(getReadyOfflineMutations(firstFailure, OWNER, '2026-07-13T12:00:02.000Z')).toHaveLength(
      1,
    )
    expect(() =>
      markOfflineMutationSyncing(firstFailure, OWNER, 'mutation-1', '2026-07-13T12:00:01.999Z'),
    ).toThrow(TypeError)
  })

  it('stops retrying at the configured maximum', () => {
    const config = { maximumRetries: 1, baseDelayMs: 100, maximumDelayMs: 1_000 }
    const first = markOfflineMutationFailed(
      queuedMutation(),
      OWNER,
      'mutation-1',
      'network_unavailable',
      true,
      NOW,
      config,
    )
    const second = markOfflineMutationFailed(
      first,
      OWNER,
      'mutation-1',
      'network_unavailable',
      true,
      NOW,
      config,
    )
    expect(second[0]).toMatchObject({
      retryCount: 2,
      status: 'failed',
      nextAttemptAt: null,
    })
  })

  it('does not retry permanent errors', () => {
    const result = markOfflineMutationFailed(
      queuedMutation(),
      OWNER,
      'mutation-1',
      'validation_rejected',
      false,
      NOW,
    )
    expect(result[0]?.status).toBe('failed')
  })

  it('reconciles mixed server results and retains sync status until cleanup', () => {
    const queue = queuedMutation('mutation-2', queuedMutation('mutation-1'))
    const reconciled = reconcileOfflineMutationResults(
      queue,
      OWNER,
      [
        { id: 'mutation-1', outcome: 'synced' },
        {
          id: 'mutation-2',
          outcome: 'retryable_error',
          errorCode: 'network_unavailable',
        },
      ],
      NOW,
    )
    expect(reconciled.map((mutation) => mutation.status)).toEqual(['synced', 'retry_wait'])
    expect(removeSyncedOfflineMutations(reconciled)).toHaveLength(1)
  })

  it('returns ready work in created order with a limit', () => {
    const first = queuedMutation('mutation-z')
    const queue = enqueueOfflineMutation(
      first,
      {
        id: 'mutation-a',
        ownerKey: OWNER,
        mutationType: 'session.update_elapsed',
        payload: { sessionId: 'session-2', elapsedSeconds: 1 },
        createdAt: '2026-07-13T11:00:00.000Z',
      },
      NOW,
    )
    expect(getReadyOfflineMutations(queue, OWNER, NOW, 1)[0]?.id).toBe('mutation-a')
  })

  it('requires privacy-safe error codes, not raw error messages', () => {
    expect(() =>
      markOfflineMutationFailed(
        queuedMutation(),
        OWNER,
        'mutation-1',
        'Request failed for client Jane Doe',
        false,
        NOW,
      ),
    ).toThrow(TypeError)
  })

  it('scopes ready work and sign-out cleanup to one owner', () => {
    const firstOwnerQueue = queuedMutation('mutation-owner-1')
    const queue = enqueueOfflineMutation(
      firstOwnerQueue,
      {
        id: 'mutation-owner-2',
        ownerKey: 'auth-user-2',
        mutationType: 'session.update_elapsed',
        payload: { sessionId: 'session-2', elapsedSeconds: 30 },
      },
      NOW,
    )

    expect(getReadyOfflineMutations(queue, OWNER, NOW)).toHaveLength(1)
    expect(getReadyOfflineMutations(queue, 'auth-user-2', NOW)).toHaveLength(1)
    expect(removeOfflineMutationsForOwner(queue, OWNER)).toEqual([
      expect.objectContaining({ ownerKey: 'auth-user-2' }),
    ])
    expect(() => markOfflineMutationSyncing(queue, 'auth-user-2', 'mutation-owner-1', NOW)).toThrow(
      RangeError,
    )
  })
})
