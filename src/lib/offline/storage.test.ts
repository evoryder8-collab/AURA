import { describe, expect, it } from 'vitest'

import { enqueueOfflineMutation } from './mutation-queue'
import { createOfflineMutationStorage } from './storage'

const NOW = '2026-07-13T12:00:00.000Z'

function mutation(ownerKey: string, id: string) {
  return enqueueOfflineMutation(
    [],
    {
      id,
      ownerKey,
      mutationType: 'session.update_elapsed',
      payload: { sessionId: 'session-1', elapsedSeconds: 30 },
    },
    NOW,
  )[0]!
}

describe('offline mutation storage', () => {
  it('stores and replaces one owner queue in the memory fallback', async () => {
    const storage = createOfflineMutationStorage({ forceMemory: true })
    await storage.save('owner-1', [mutation('owner-1', 'mutation-1')])
    expect(await storage.load('owner-1')).toHaveLength(1)

    await storage.save('owner-1', [
      mutation('owner-1', 'mutation-2'),
      mutation('owner-1', 'mutation-3'),
    ])
    expect((await storage.load('owner-1')).map((item) => item.id)).toEqual([
      'mutation-2',
      'mutation-3',
    ])
  })

  it('keeps owners isolated and clears only the signed-out owner', async () => {
    const storage = createOfflineMutationStorage({ forceMemory: true })
    await storage.save('owner-1', [mutation('owner-1', 'mutation-1')])
    await storage.save('owner-2', [mutation('owner-2', 'mutation-2')])

    await storage.clear('owner-1')
    expect(await storage.load('owner-1')).toEqual([])
    expect(await storage.load('owner-2')).toHaveLength(1)
  })

  it('rejects a queue containing another owner or duplicate ids', async () => {
    const storage = createOfflineMutationStorage({ forceMemory: true })
    await expect(storage.save('owner-1', [mutation('owner-2', 'mutation-1')])).rejects.toThrow(
      TypeError,
    )
    const duplicate = mutation('owner-1', 'mutation-duplicate')
    await expect(storage.save('owner-1', [duplicate, duplicate])).rejects.toThrow(TypeError)
  })

  it('rejects additional top-level data outside the queue schema', async () => {
    const storage = createOfflineMutationStorage({ forceMemory: true })
    const withPrivateDetail = {
      ...mutation('owner-1', 'mutation-extra'),
      clientName: 'Must not be persisted in queue metadata',
    }
    await expect(storage.save('owner-1', [withPrivateDetail])).rejects.toThrow(TypeError)
  })
})
