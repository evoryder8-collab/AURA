import { describe, expect, it } from 'vitest'

import { createMinimalPendingSessionState } from './pending-session'
import { createPendingSessionStorage } from './pending-session-storage'

function state(appointmentId: string) {
  return createMinimalPendingSessionState({
    sessionId: `session-${appointmentId}`,
    appointmentId,
    startedAt: '2026-07-13T10:00:00.000Z',
    updatedAt: '2026-07-13T10:05:00.000Z',
    elapsedSeconds: 300,
    paused: false,
    selectedRegionIds: ['left-shoulder'],
  })
}

describe('pending Session Mode storage', () => {
  it('saves, loads, and removes only the minimal state', async () => {
    const storage = createPendingSessionStorage({ forceMemory: true })
    await storage.save('owner-1', state('appointment-1'))
    expect(await storage.load('owner-1', 'appointment-1')).toEqual(state('appointment-1'))

    await storage.remove('owner-1', 'appointment-1')
    expect(await storage.load('owner-1', 'appointment-1')).toBeNull()
  })

  it('keeps identical appointment ids isolated by owner', async () => {
    const storage = createPendingSessionStorage({ forceMemory: true })
    await storage.save('owner-1', state('shared-appointment'))
    await storage.save('owner-2', {
      ...state('shared-appointment'),
      elapsedSeconds: 900,
    })

    expect((await storage.load('owner-1', 'shared-appointment'))?.elapsedSeconds).toBe(300)
    expect((await storage.load('owner-2', 'shared-appointment'))?.elapsedSeconds).toBe(900)
  })

  it('clears only the signed-out owner', async () => {
    const storage = createPendingSessionStorage({ forceMemory: true })
    await storage.save('owner-1', state('appointment-1'))
    await storage.save('owner-2', state('appointment-2'))

    await storage.clear('owner-1')
    expect(await storage.load('owner-1', 'appointment-1')).toBeNull()
    expect(await storage.load('owner-2', 'appointment-2')).not.toBeNull()
  })

  it('rejects expanded state that could contain private session detail', async () => {
    const storage = createPendingSessionStorage({ forceMemory: true })
    const expanded = {
      ...state('appointment-1'),
      therapistNote: 'Must never be persisted here',
    }
    await expect(storage.save('owner-1', expanded)).rejects.toThrow(TypeError)
  })
})
